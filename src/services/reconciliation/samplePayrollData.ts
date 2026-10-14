/**
 * DATOS DE PRUEBA Y DISPERSIÓN DE NÓMINA INSTITUCIONAL
 * Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R.
 * Convenios: STSGECH (Gobierno de Chihuahua) y Supremo Tribunal de Justicia
 *
 * Diseñado conforme a la Regla 2 (HRU) y Watch Item 2 (Zero-PII / Identificadores Sintéticos de Prueba)
 */

import { PayrollRecordInput } from '../../types';

export const SAMPLE_STSGECH_PAYROLL: PayrollRecordInput[] = [
  {
    curp: 'AAGH650922HCHLTC04',
    employeeName: 'Ing. Alejandro Alarcón Gutiérrez',
    actualPayment: 569.44, // Cuota exacta para préstamo $10k a 24q
    agreementName: 'STSGECH',
  },
  {
    curp: 'CARR801115MCHNR008',
    employeeName: 'Lic. Claudia Ramírez Rascón',
    actualPayment: 569.44, // Cuota exacta
    agreementName: 'STSGECH',
  },
  {
    curp: 'PEHJ750403HCHLN002',
    employeeName: 'Mtro. Pedro Hernández Jurado',
    actualPayment: 300.00, // Retención Parcial (Permiso sin goce / Inconsistencia)
    agreementName: 'STSGECH',
  },
  {
    curp: 'ROFM820612MCHRD005',
    employeeName: 'Dra. Rosa Flores Morales',
    actualPayment: 600.00, // Excedente ($30.56 saldo a favor)
    agreementName: 'STSGECH',
  },
  {
    curp: 'GONM900218HCHPR001',
    employeeName: 'Lic. Gonzalo Navarrete Mendoza',
    actualPayment: 1138.88, // Cuota exacta préstamo $20k a 24q ($569.44 * 2)
    agreementName: 'STSGECH',
  },
];

export const SAMPLE_SUPREMO_TRIBUNAL_PAYROLL: PayrollRecordInput[] = [
  {
    curp: 'BAMJ740810HCHRD009',
    employeeName: 'Magistrado Javier Baca Morales',
    actualPayment: 569.44, // Cuota exacta
    agreementName: 'SUPREMO_TRIBUNAL',
  },
  {
    curp: 'LOEE850325MCHLS003',
    employeeName: 'Secretaria Elvira López Estrada',
    actualPayment: 569.44, // Cuota exacta
    agreementName: 'SUPREMO_TRIBUNAL',
  },
  {
    curp: 'DUAM791201HCHNN007',
    employeeName: 'Actuario Manuel Duarte Aguilar',
    actualPayment: 350.00, // Retención Parcial
    agreementName: 'SUPREMO_TRIBUNAL',
  },
  {
    curp: 'SARE880514MCHTM006',
    employeeName: 'Jueza Elena Salinas Reza',
    actualPayment: 700.00, // Excedente
    agreementName: 'SUPREMO_TRIBUNAL',
  },
];
