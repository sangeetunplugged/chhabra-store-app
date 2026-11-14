// Backup: until the cloud database is connected, all data lives on the counter phone.
// A daily backup file sent on WhatsApp (or saved to Drive) is the safety net.
import { exportAll, importAll } from './db.js';
import { dayKey } from './format.js';

export async function shareBackup() {
  const data = await exportAll();
  const name = 'chhabra-backup-' + dayKey() + (data.mode === 'practice' ? '-practice' : '') + '.json';
  const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name, text: 'Chhabra Store backup ' + dayKey() });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return 'downloaded';
}

export async function restoreBackup(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  await importAll(data);
  return data;
}
