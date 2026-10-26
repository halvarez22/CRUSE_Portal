import * as xlsx from 'xlsx';
import * as fs from 'fs';

const invFile = 'C:\\CRUSE_PORTAL\\Exceles_Alma\\2. relacion y pago inversionistas 2026.xlsx';
const loanFile = 'C:\\CRUSE_PORTAL\\Exceles_Alma\\Q. CREDITOS ACTIVOS admon y cotejo.xlsx';

function dumpHeaders(file: string) {
  const buf = fs.readFileSync(file);
  const wb = xlsx.read(buf, { type: 'buffer' });
  console.log(`\n--- File: ${file} ---`);
  wb.SheetNames.forEach(sheetName => {
    console.log(`Sheet: ${sheetName}`);
    const sheet = wb.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 })[0];
    console.log(`Headers: ${JSON.stringify(data)}`);
  });
}

dumpHeaders(invFile);
dumpHeaders(loanFile);
