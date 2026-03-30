const strings = [
  "2000-01-01T7:50:00:00",
  "2000-01-01T2026/03/02 9:00:00:00",
  "2026-03-24T06:40",
  "2026/03/03 9:00:00",
  "08:00:00",
  "8:00",
  "invalid string",
  "",
  null,
  undefined
];

const formatTimeSafe = (timeString) => {
  if (!timeString) return null;
  
  try {
     const match = timeString.toString().match(/([0-9]{1,2}):([0-9]{2})/);
     if (match) {
        const hour = match[1].padStart(2, '0');
        const min = match[2];
        return `${hour}:${min}`;
     }
     
     return null;
  } catch(e) {
     return null;
  }
};

strings.forEach(s => console.log(s, "->", formatTimeSafe(s)));
