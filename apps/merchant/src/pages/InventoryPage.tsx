import { InventoryProcurementPanel } from '../components/InventoryProcurementPanel';
import { OperationalModulePage } from '../modules/OperationalModulePage';

export function InventoryPage(){
  return <div className="stack-lg"><OperationalModulePage moduleKey="inventory" title="Estoque" description="Saldo, reservas, compras, recebimentos, lotes, validade e custos em um único fluxo."/><InventoryProcurementPanel/></div>;
}
