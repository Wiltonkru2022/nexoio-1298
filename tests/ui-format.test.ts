import { describe, expect, it } from 'vitest';
import { formatCEP, formatCNPJ, formatCPF, formatCurrency, formatPhone } from '../packages/ui/src/format';

describe('formatação brasileira da Nexoio',()=>{
  it('formata moeda em real brasileiro',()=>expect(formatCurrency(1249.9)).toBe('R$ 1.249,90'));
  it('formata CPF e CNPJ',()=>{expect(formatCPF('12345678901')).toBe('123.456.789-01');expect(formatCNPJ('12345678000190')).toBe('12.345.678/0001-90')});
  it('formata CEP e telefone',()=>{expect(formatCEP('79002120')).toBe('79002-120');expect(formatPhone('5567999999999')).toBe('(67) 99999-9999')});
});
