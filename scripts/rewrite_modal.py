import sys

filepath = 'src/pages/attendance/WorkerAttendance.tsx'

with open(filepath, 'r') as f:
    code = f.read()

# I will replace the modal state and saving logic
# and replace the modal rendering area perfectly.

# We will break down the file and rewrite it
new_code = '''import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Clock, X, Plus, Trash2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

interface DailyAttendance {
  id: string;
  worker_id: string;
  target_date: string;
  clock_in_time: string | null;
  clock_out_time: string | null;
  role: '職長' | '現場代理人' | '一般' | null;
  prep_time_minutes: number;
  travel_time_minutes: number;
  personal_out_minutes?: number;
  personal_outs?: { start_time: string; end_time: string }[];
  is_locked: boolean;
  memo: string | null;
  site_declarations?: { project_id: string; project_name: string; start_time: string; end_time: string; role?: string }[];
}

export type TimelineEvent = {
  id: string;
  time: string;
  type: 'clock_in' | 'travel' | 'site_work' | 'clock_out';
  project_id?: string;
  project_name?: string;
  role?: string;
};

export default function WorkerAttendance() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, DailyAttendance>>({});
  const [assignedProjects, setAssignedProjects] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [workerId, setWorkerId] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [allProjects, setAllProjects] = useState<{ id: string; project_name: string; status: string }[]>([]);
  
  // New Timeline State
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [personalOuts, setPersonalOuts] = useState<{ start_time: string; end_time: string }[]>([]);
  const [memo, setMemo] = useState<string>('');
  const [recordId, setRecordId] = useState<string | null>(null);
'''

# The rest of the file... I will just use multi-replace on the main logic chunks directly instead of a Python script. It's safer.
