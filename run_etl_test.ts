import { config } from 'dotenv';
config();
import { runLoansETL } from './src/services/etl/runETL';

const loanFile = 'C:\\CRUSE_PORTAL\\Exceles_Alma\\Q. CREDITOS ACTIVOS admon y cotejo.xlsx';

async function main() {
  console.log('Iniciando proceso ETL Histórico...');
  try {
    await runLoansETL(loanFile);
    console.log('✅ Migración exitosa.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error en la migración:', err);
    process.exit(1);
  }
}

main();
