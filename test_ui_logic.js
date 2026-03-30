import { format } from 'date-fns';

const formatTimeSafe = (timeString) => {
   try {
     if (timeString.includes('T')) {
        const dObj = new Date(timeString);
        // if invalid date
        if (isNaN(dObj.getTime())) return timeString.split('T')[1].substring(0, 5);
        return format(dObj, 'HH:mm');
     }
     return timeString.substring(0, 5);
   } catch(e) {
     return timeString.substring(0, 5);
   }
};

console.log(formatTimeSafe('2026-03-17T07:00'));
console.log(formatTimeSafe('2000-01-01T7:30:00:00'));
