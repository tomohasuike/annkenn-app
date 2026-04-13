import naisenRules from './naisen_rules.json';

export interface CalcLoad {
  id?: string;
  name: string;
  capacity_kw: number;
  equipment_type: 'motor' | 'heater' | 'lighting' | 'outlet' | string;
  is_existing: boolean;
  interlock_group_id?: string | null;
  operation_mode: 'simultaneous' | 'alternating'; // Explicit control method
  starting_method?: 'direct' | 'star_delta' | 'inverter'; // Motor specific
  distance_m?: number;
  
  // System outputs
  calculated_breaker_size?: string;
  override_breaker_size?: string;
  calculated_cable_size?: string;
  calculated_conduit_size?: string;
}

export interface ContractEvaluationResult {
  route_a_load_kw: number;
  route_b_main_kw: number;
  is_low_voltage_ok: boolean;
  final_contract_kw: number; // The smaller of route A or Route B
}

export class CalcEngine {
  /**
   * 東電公式 特例圧縮アルゴリズム (ルートA: 負荷設備契約)
   * 設備の種別・連動条件・台数・総容量を踏まえて契約電力を極限まで圧縮するロジック
   */
  static calculateTepcoLoadCompression(loads: CalcLoad[]): number {
    // Step 1: 入力換算と切替特例
    // Heaters: kW * 100%
    // Motors: kW * 125%
    // 切替設定(インターロック or 交互運転): グループ内で最大容量の1台のみ加算対象とする
    
    const groups: Record<string, CalcLoad[]> = {};
    const standaloneLoads: CalcLoad[] = [];

    loads.forEach(load => {
      // 交互運転(alternating) の場合は、機器名自体を簡易的なグループIDとして扱う仕組みなどが必要（実システムではUIでグループ化）
      // ここではプロパティとして interlock_group_id が割り当てられているものとする。
      const groupId = load.interlock_group_id || (load.operation_mode === 'alternating' ? `alt_${load.name}` : null);
      
      if (groupId) {
          if (!groups[groupId]) groups[groupId] = [];
          groups[groupId].push(load);
      } else {
          standaloneLoads.push(load);
      }
    });

    let convertedCapacities: number[] = [];

    const getConvertedKw = (l: CalcLoad) => {
       const multiplier = (l.equipment_type === 'motor') ? 1.25 : 1.0;
       return l.capacity_kw * multiplier;
    };

    // 独立負荷はそのまま換算して配列へ
    standaloneLoads.forEach(l => convertedCapacities.push(getConvertedKw(l)));

    // インターロック/交互 グループは「グループ内で最大のもの1台のみ」を配列へ
    Object.values(groups).forEach(groupLoads => {
       const maxCap = Math.max(...groupLoads.map(getConvertedKw));
       convertedCapacities.push(maxCap);
    });

    // Step 2: ソート＆ランク積算（台数圧縮）
    convertedCapacities.sort((a, b) => b - a); // 大きい順(降順)

    let step2Sum = 0;
    convertedCapacities.forEach((cap, idx) => {
        const rank = idx + 1;
        if (rank <= 2) {
            step2Sum += cap * 1.0;  // 1-2位
        } else if (rank <= 4) {
            step2Sum += cap * 0.95; // 3-4位
        } else {
            step2Sum += cap * 0.90; // 5位以下
        }
    });

    // 必須要件: 小数第一位四捨五入
    step2Sum = Math.round(step2Sum);

    // Step 3: 容量圧縮 (ティア・階段方式)
    let finalContractKw = 0;
    let remaining = step2Sum;

    // 最初の 6kW分 : 100%
    const tier1 = Math.min(remaining, 6);
    finalContractKw += tier1 * 1.0;
    remaining -= tier1;

    // 次の 14kW分 (6kW超〜20kW) : 90%
    if (remaining > 0) {
        const tier2 = Math.min(remaining, 14);
        finalContractKw += tier2 * 0.90;
        remaining -= tier2;
    }

    // 次の 30kW分 (20kW超〜50kW) : 80%
    if (remaining > 0) {
        const tier3 = Math.min(remaining, 30);
        finalContractKw += tier3 * 0.80;
        remaining -= tier3;
    }

    // 50kWを超える部分 : 70%
    if (remaining > 0) {
        finalContractKw += remaining * 0.70;
    }

    // 最終も四捨五入して整数化
    return Math.round(finalContractKw);
  }

  /**
   * ルートB：主開閉器契約アルゴリズム
   * @param mainBreakerAmp 主幹ブレーカのトリップ電流(AT)
   * @param voltage_v 電圧 (デフォルト 200V)
   * @param phase 相 (3=三相, 1=単相)
   */
  static calculateMainBreakerContract(mainBreakerAmp: number, voltage_v: number = 200, phase: 1 | 3 = 3): number {
      const rootThree = phase === 3 ? 1.732 : 1.0;
      const kw = (mainBreakerAmp * voltage_v * rootThree) / 1000;
      return Math.round(kw); // 四捨五入
  }

  /**
   * プロジェクト全体の契約電力（低圧・高圧）判定
   * ルートAとルートBのうち、より小さい方を採用する
   */
  static evaluateContract(loads: CalcLoad[], mainBreakerAmp: number): ContractEvaluationResult {
      const routeA = this.calculateTepcoLoadCompression(loads);
      const routeB = this.calculateMainBreakerContract(mainBreakerAmp, 200, 3);
      
      const finalKw = Math.min(routeA, routeB);
      return {
          route_a_load_kw: routeA,
          route_b_main_kw: routeB,
          final_contract_kw: finalKw,
          is_low_voltage_ok: finalKw < 50
      };
  }

  /**
   * 非標準容量の安全丸め込み (例: 2.7kW -> 3.7kW への引き上げ)
   */
  static normalizeMotorCapacity(kw: number): string {
     // 内線規程 等の標準モーターリスト
     const standardSizes = [0.4, 0.75, 1.5, 2.2, 3.7, 5.5, 7.5, 11, 15, 22, 30, 37, 45, 55];
     const size = standardSizes.find(s => s >= kw);
     return size ? size.toString() : '55'; // オーバーフロー時は最大値扱い
  }

  /**
   * 個別負荷のブレーカ・電線サイズ選定 (内線規程ベース)
   * ※既設フラグがONの場合はシステム再計算をロックする
   */
  static calculateDeviceSizing(load: CalcLoad): CalcLoad {
      // 人間からのオーバーライド（固定値）指定があれば、システム計算を飛ばしてそれを尊重（あるいは併記）。
      // 既設品の場合もロック。
      if (load.is_existing) {
          return load;
      }

      if (load.equipment_type === 'motor') {
          // モーターの場合は突入・始動電流を加味したロジックが必要
          const standardKw = this.normalizeMotorCapacity(load.capacity_kw);
          
          // Type assertion for nested json objects
          const motorCurrentMap = (naisenRules as any).motor_full_load_current.mapping_kw_to_amp as Record<string, number>;
          
          // 規約電流を取得 (不明なら概算)
          const currentA = motorCurrentMap[standardKw] || (load.capacity_kw * 4); 

          // 始動方式によるブレーカの乗数補正 (フェールセーフで不明時は直入とする)
          let breakerMultiplier = 3.0; // 厳しめに見るデフォルト値 (直入想定)
          if (load.starting_method === 'direct') {
              breakerMultiplier = 3.0; // 直入
          } else if (load.starting_method === 'star_delta') {
              breakerMultiplier = 2.0; // Y-Δ
          } else if (load.starting_method === 'inverter') {
              breakerMultiplier = 1.25; // インバータ・ソフトスタータ (突入制御)
          }

          const requiredAmp = currentA * breakerMultiplier;
          
          // 標準ブレーカサイズ（AT）リスト
          const standardBreakers = [20, 30, 40, 50, 60, 75, 100, 125, 150, 200, 225, 250, 300, 400];
          const selectedBreaker = standardBreakers.find(b => b >= requiredAmp) || 500;
          
          load.calculated_breaker_size = `${selectedBreaker}AT`;

          // 電線サイズの簡易選定（電流減少係数・電圧降下は拡張予定）
          // (IV_conduit_3W 等から牽く実装をここに入れる)

      } else {
           // ヒーター（電熱器）など一般的な抵抗負荷
           const currentA = (load.capacity_kw * 1000) / (200 * 1.732); // 三相200V前提
           const requiredAmp = currentA * 1.25; // 連続負荷の安全マージン
           
           const standardBreakers = [20, 30, 40, 50, 60, 75, 100, 125, 150, 200];
           const selectedBreaker = standardBreakers.find(b => b >= requiredAmp) || 400;
           load.calculated_breaker_size = `${selectedBreaker}AT`;
      }

      return load;
  }
}
