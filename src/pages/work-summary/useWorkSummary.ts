import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { parseISO } from 'date-fns';

export type WorkCategory = 'kouji' | 'kanri' | 'mitsumori';

export type TimeDetail = {
  normal: number;
  ot: number;
}

export type SummaryStats = {
  totalPeople: number;
  totalHours: number;
  totalOT: number;
  equipment: Record<string, number>;
  kubunTotals: Record<WorkCategory, number>;
  kubunDetails: Record<WorkCategory, TimeDetail>;
}

export type DailyLog = {
  reportId: string;
  date: string;
  kubun: string;
  staffs: string;
  partners: string;
  hours: number;
  ot: number;
  car: string;
  machine: string;
}

export type ProjectSummary = {
  id: string;
  no: string;
  name: string;
  kubun: string;
  staffCount: number;
  partnerCount: number;
  normalHours: number;
  overtimeHours: number;
  totalHours: number;
  breakdown: Record<WorkCategory, number>;
  breakdownDetails: Record<WorkCategory, TimeDetail>;
  materials: string[];
  photos: { url: string, fileName: string, projectName: string }[];
  docs: { url: string, fileName: string, projectName: string }[];
  equipment: Record<string, number>;
  dailyLogs: DailyLog[];
}

export type StaffSummary = Record<WorkCategory, TimeDetail> & { displayName: string };

export type AggregationResult = {
  projects: Record<string, ProjectSummary>;
  staff: Record<string, StaffSummary>;
  companies: Record<string, { total: number; projects: { date: string; projectName: string; count: number }[] }>;
  summary: SummaryStats;
}

export type ProjectItem = {
  id: string;
  name: string;
  no: string;
  kubun: string;
  status: string;
}

function calculateActualHours(startVal: string | null | undefined, endVal: string | null | undefined): TimeDetail {
  const parseTime = (val: string) => {
    if (!val) return null;
    let d = new Date();
    if (val.includes('T')) {
      d = parseISO(val);
    } else {
      const match = val.match(/(\d{1,2})[:：](\d{1,2})/);
      if (match) {
        d.setHours(parseInt(match[1]), parseInt(match[2]), 0, 0);
      } else {
        d = new Date(val);
      }
    }
    if (isNaN(d.getTime())) return null;
    return d;
  };

  const st = startVal ? parseTime(startVal) : null;
  const et = endVal ? parseTime(endVal) : null;
  
  if (!st || !et) return { normal: 0, ot: 0 };
  
  const startMin = st.getHours() * 60 + st.getMinutes();
  const endMin = et.getHours() * 60 + et.getMinutes();
  if (endMin <= startMin) return { normal: 0, ot: 0 };

  const standardLimit = 17 * 60;
  const breakStart = 12 * 60;
  const breakEnd = 13 * 60;

  let normal = Math.min(standardLimit, endMin) - startMin;
  
  if (startMin <= breakStart && endMin >= breakEnd) normal -= 60;
  else if (startMin > breakStart && startMin < breakEnd) normal -= (breakEnd - startMin);
  else if (endMin > breakStart && endMin < breakEnd) normal -= (endMin - breakStart);

  let ot = Math.max(0, endMin - Math.max(startMin, standardLimit));
  
  return { 
    normal: Math.max(0, normal / 60), 
    ot: Math.max(0, ot / 60) 
  };
}

export function useWorkSummary() {
  const [data, setData] = useState<AggregationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectsList, setProjectsList] = useState<ProjectItem[]>([]);

  useEffect(() => {
    async function loadProjects() {
      const { data: pData, error } = await supabase
        .from('projects')
        .select('id, project_name, project_number, category, status_flag')
        .order('created_at', { ascending: false });
        
      if (!error && pData) {
        setProjectsList(pData.map(p => ({
          id: p.id,
          name: p.project_name || '',
          no: p.project_number || '-',
          kubun: p.category || '一般',
          status: p.status_flag || '着工前'
        })));
      }
    }
    loadProjects();
  }, []);

  const fetchData = async (startDate: string, endDate: string, projectId: string, isAllTime: boolean) => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Reports
      let query = supabase
        .from('daily_reports')
        .select(`
          id, project_id, report_date, work_category, start_time, end_time, site_photos,
          projects (id, project_name, project_number, category),
          report_personnel (worker_name, worker_master(name), start_time, end_time),
          report_vehicles (vehicle_name, vehicle_master(vehicle_name)),
          report_machinery (machinery_name, vehicle_master(vehicle_name)),
          report_materials (material_name, quantity, photo, documentation),
          report_subcontractors (subcontractor_name, worker_count, start_time, end_time)
        `);

      if (!isAllTime) {
        query = query.gte('report_date', `${startDate}T00:00:00+09:00`)
                     .lte('report_date', `${endDate}T23:59:59+09:00`);
      }
      
      if (projectId) {
        query = query.eq('project_id', projectId);
      }

      const { data: reports, error: fetchErr } = await query;

      if (fetchErr) throw fetchErr;

      // 2. Initialize Result Structure
      const results: AggregationResult = {
        projects: {},
        staff: {},
        companies: {},
        summary: {
          totalPeople: 0,
          totalHours: 0,
          totalOT: 0,
          equipment: {},
          kubunTotals: { kouji: 0, kanri: 0, mitsumori: 0 },
          kubunDetails: { kouji: {normal:0, ot:0}, kanri: {normal:0, ot:0}, mitsumori: {normal:0, ot:0} }
        }
      };

      if (!reports) {
        setData(results);
        setLoading(false);
        return;
      }

      // 3. Process each report
      for (const row of reports) {
        const pId = row.project_id;
        if (!pId) continue;
        
        const pInfo = row.projects as any;
        const pName = Array.isArray(pInfo) ? pInfo[0]?.project_name : pInfo?.project_name || `不明(${pId})`;
        const pNo = Array.isArray(pInfo) ? pInfo[0]?.project_number : pInfo?.project_number || '-';
        const pKubun = Array.isArray(pInfo) ? pInfo[0]?.category : pInfo?.category || '一般';
        
        const wKubun = row.work_category || '';
        let cat: WorkCategory = 'mitsumori';
        if (wKubun.includes('工事')) cat = 'kouji';
        else if (wKubun.includes('管理')) cat = 'kanri';

        if (!results.projects[pId]) {
          results.projects[pId] = {
            id: pId, no: pNo, name: pName, kubun: pKubun,
            staffCount: 0, partnerCount: 0,
            normalHours: 0, overtimeHours: 0, totalHours: 0,
            breakdown: { kouji: 0, kanri: 0, mitsumori: 0 },
            breakdownDetails: { kouji: {normal:0, ot:0}, kanri: {normal:0, ot:0}, mitsumori: {normal:0, ot:0} },
            materials: [], photos: [], docs: [],
            equipment: {},
            dailyLogs: [] 
          };
        }
        const pObj = results.projects[pId];

        // Ignore schedules or incomplete reports that have no end_time
        if (!row.end_time) continue;

        // Parse Time
        const timeInfo = calculateActualHours(row.start_time, row.end_time);
        const totalH = timeInfo.normal + timeInfo.ot;

        // Parse Staff and Deduplicate
        const workers = Array.isArray(row.report_personnel) ? row.report_personnel : [];
        const staffMap = new Map<string, {name: string, start_time: string, end_time: string}>();
        
        workers.forEach((w: any) => {
          let name = w.worker_name;
          if (w.worker_master) {
             name = Array.isArray(w.worker_master) ? w.worker_master[0]?.name : w.worker_master.name;
          }
          if (!name) return;
          const key = name.replace(/[\s　]+/g, "");
          if (!staffMap.has(key)) {
             staffMap.set(key, { 
                name: name,
                start_time: w.start_time || row.start_time,
                end_time: w.end_time || row.end_time
             });
          }
        });
        const staffsData = Array.from(staffMap.values());
        
        // Parse Equipment and Deduplicate
        const cars = [...new Set(Array.isArray(row.report_vehicles)
          ? row.report_vehicles.map((v: any) => {
              const masterName = Array.isArray(v.vehicle_master)
                ? v.vehicle_master[0]?.vehicle_name
                : v.vehicle_master?.vehicle_name;
              return v.vehicle_name || masterName;
            }).filter(Boolean)
          : [])];
        const machines = [...new Set(Array.isArray(row.report_machinery)
          ? row.report_machinery.map((m: any) => {
              const masterName = Array.isArray(m.vehicle_master)
                ? m.vehicle_master[0]?.vehicle_name
                : m.vehicle_master?.vehicle_name;
              return m.machinery_name || masterName;
            }).filter(Boolean)
          : [])];
        const eqList = [...cars, ...machines];
        
        // Parse Subcontractors and Deduplicate
        const subsRaw = Array.isArray(row.report_subcontractors) ? row.report_subcontractors : [];
        const subsMap = new Map<string, any>();
        subsRaw.forEach(s => {
           const subName = (s.subcontractor_name || '不明業者');
           const sTime = s.start_time || row.start_time;
           const eTime = s.end_time || row.end_time;
           const key = `${subName.replace(/[\s　]+/g, "")}_${sTime}_${eTime}`;
           
           if (!subsMap.has(key)) {
               subsMap.set(key, { ...s, subcontractor_name: subName, start_time: sTime, end_time: eTime });
           } else {
               const existing = subsMap.get(key);
               existing.worker_count = (Number(existing.worker_count) || 0) + (Number(s.worker_count) || 0);
           }
        });
        const subs = Array.from(subsMap.values());
        
        // Parse Materials/Photos/Docs
        const materials = Array.isArray(row.report_materials) ? row.report_materials : [];
        
        // --- Accumulate Data ---
        
        // Subcontractors
        subs.forEach((sub: any) => {
          const count = Number(sub.worker_count) || 0;
          const name = sub.subcontractor_name || '不明業者';
          pObj.partnerCount += count;
          results.summary.totalPeople += count;
          
          if (!results.companies[name]) {
            results.companies[name] = { total: 0, projects: [] };
          }
          results.companies[name].total += count;
          
          let formattedDate = '不明';
          if (row.report_date) {
            const d = new Date(row.report_date);
            if (!isNaN(d.getTime())) {
              const days = ['日', '月', '火', '水', '木', '金', '土'];
              const mm = String(d.getMonth() + 1).padStart(2, '0');
              const dd = String(d.getDate()).padStart(2, '0');
              formattedDate = `${mm}/${dd}(${days[d.getDay()]})`;
            } else {
              formattedDate = row.report_date.split('T')[0];
            }
          }

          results.companies[name].projects.push({
            date: formattedDate,
            projectName: pName,
            count: count
          });
        });

        // Equipment
        eqList.forEach(eq => {
          pObj.equipment[eq] = (pObj.equipment[eq] || 0) + 1;
          results.summary.equipment[eq] = (results.summary.equipment[eq] || 0) + 1;
        });

        // Materials & Photos
        materials.forEach((m: any) => {
          if (m.material_name) {
            const qtyStr = m.quantity ? ` ${m.quantity}` : '';
            pObj.materials.push(m.material_name + qtyStr);
          }
          
          if (m.photo) {
            try {
              const parsed = JSON.parse(m.photo);
              const urls = Array.isArray(parsed) ? parsed : [m.photo];
              urls.forEach(url => {
                const fName = m.material_name ? `${m.material_name} (写真)` : (url.split('/').pop() || '写真');
                if(url) pObj.photos.push({ url, fileName: fName, projectName: pName });
              });
            } catch(e) {
              const fName = m.material_name ? `${m.material_name} (写真)` : '写真';
              if (m.photo) pObj.photos.push({ url: m.photo, fileName: fName, projectName: pName });
            }
          }
          if (m.documentation) {
            try {
              const parsed = JSON.parse(m.documentation);
              const urls = Array.isArray(parsed) ? parsed : [m.documentation];
              urls.forEach(url => {
                const fName = m.material_name ? `${m.material_name} (資料)` : (url.split('/').pop() || '資料');
                if(url) pObj.docs.push({ url, fileName: fName, projectName: pName });
              });
            } catch(e) {
              const fName = m.material_name ? `${m.material_name} (資料)` : '資料';
              if (m.documentation) pObj.docs.push({ url: m.documentation, fileName: fName, projectName: pName });
            }
          }
        });
        
        // Site photos are excluded from the photo list per user request

        let formattedDate = '不明';
        if (row.report_date) {
            const dStr = row.report_date;
            // Provide a clean parse using JS Date to handle UTC to Local JST conversion properly
            const d = new Date(dStr);
            if (!isNaN(d.getTime())) {
                const days = ['日', '月', '火', '水', '木', '金', '土'];
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                formattedDate = `${yyyy}-${mm}-${dd} (${days[d.getDay()]})`;
            } else {
                formattedDate = dStr.split('T')[0];
            }
        }

        // Daily Log
        pObj.dailyLogs.push({
          reportId: row.id,
          date: formattedDate,
          kubun: wKubun || "一般",
          staffs: staffsData.map(s => {
              const info = calculateActualHours(s.start_time, s.end_time);
              const custom = (s.start_time !== row.start_time || s.end_time !== row.end_time) ? `(${info.normal + info.ot}h)` : '';
              return `${s.name}${custom}`;
          }).join(", "),
          partners: subs.map((s:any) => {
              const info = calculateActualHours(s.start_time, s.end_time);
              const custom = (s.start_time !== row.start_time || s.end_time !== row.end_time) ? ` (${info.normal + info.ot}h)` : '';
              const hc = Number(s.worker_count) > 1 ? `[${s.worker_count}名]` : '';
              return `${s.subcontractor_name}${hc}${custom}`;
          }).join(", "),
          hours: totalH,
          ot: timeInfo.ot,
          car: cars.join(", "),
          machine: machines.join(", ")
        });

        // Staff
        staffsData.forEach(staff => {
          // Calculate individual time
          const staffTimeInfo = calculateActualHours(staff.start_time, staff.end_time);
          const staffTotalH = staffTimeInfo.normal + staffTimeInfo.ot;

          const rawName = staff.name;
          const nKey = rawName.replace(/[\s　]+/g, "");
          if (!nKey) return;
          const dName = rawName.replace(/[\s　]+/g, " ");

          // Project
          pObj.staffCount++;
          pObj.normalHours += staffTimeInfo.normal;
          pObj.overtimeHours += staffTimeInfo.ot;
          pObj.totalHours += staffTotalH;
          pObj.breakdown[cat] += staffTotalH;
          pObj.breakdownDetails[cat].normal += staffTimeInfo.normal;
          pObj.breakdownDetails[cat].ot += staffTimeInfo.ot;

          // Summary
          results.summary.totalPeople++;
          results.summary.totalHours += staffTimeInfo.normal;
          results.summary.totalOT += staffTimeInfo.ot;
          results.summary.kubunTotals[cat] += staffTotalH;
          results.summary.kubunDetails[cat].normal += staffTimeInfo.normal;
          results.summary.kubunDetails[cat].ot += staffTimeInfo.ot;

          // Staff Array
          if (!results.staff[nKey]) {
            results.staff[nKey] = { displayName: dName, kouji: { normal: 0, ot: 0 }, kanri: { normal: 0, ot: 0 }, mitsumori: { normal: 0, ot: 0 } };
          }
          results.staff[nKey][cat].normal += staffTimeInfo.normal;
          results.staff[nKey][cat].ot += staffTimeInfo.ot;
        });
      }

      // Final Deduplication
      Object.values(results.projects).forEach(p => {
        p.materials = [...new Set(p.materials)];
        p.photos = p.photos.filter((obj, index, self) => index === self.findIndex((t) => t.url === obj.url));
        p.docs = p.docs.filter((obj, index, self) => index === self.findIndex((t) => t.url === obj.url));
        p.dailyLogs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      });

      setData(results);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error fetching data');
    } finally {
      setLoading(false);
    }
  };

  return { data, loading, error, fetchData, projectsList };
}
