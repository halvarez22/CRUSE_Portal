import xlsx from 'xlsx';
import fs from 'fs';

function analyzeFile(filePath: string) {
  console.log(`\n======================================================`);
  console.log(`Analizando archivo: ${filePath}`);
  console.log(`======================================================`);
  
  if (!fs.existsSync(filePath)) {
    console.log(`Archivo no encontrado.`);
    return;
  }

  const wb = xlsx.readFile(filePath);
  
  wb.SheetNames.forEach(sheetName => {
    console.log(`\n--- Pestaña: [${sheetName}] ---`);
    const sheet = wb.Sheets[sheetName];
    
    // Obtener todo como JSON (arreglo de arreglos para mantener la estructura visual)
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    
    console.log(`Filas totales: ${data.length}`);
    
    if (data.length > 0) {
      console.log(`[Estructura/Cabeceras - Primeras 3 filas no vacías]:`);
      let printed = 0;
      for (let i = 0; i < data.length && printed < 3; i++) {
        const row = data[i] as any[];
        if (row && row.length > 0 && row.some(cell => cell !== undefined && cell !== null && cell !== '')) {
          console.log(` Fila ${i + 1}:`, JSON.stringify(row));
          printed++;
        }
      }
    }
  });
}

const file1 = 'C:\\CRUSE_PORTAL\\analisis_BD\\01 - Inventario_Base_Datos_Cruse_v1.xlsx';
const file2 = 'C:\\CRUSE_PORTAL\\analisis_BD\\02 - Diccionario_Datos_Cruse_v1.xlsx';

analyzeFile(file1);
analyzeFile(file2);
