import { Button, Pill } from '@nexoio/ui';
import { ContentCard } from '../components/ContentCard';
import { PageHeader } from '../components/PageHeader';
import { StatGrid } from '../components/StatGrid';

const hours = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'];

export function SchedulePage() {
  return <>
    <PageHeader title="Agenda" description="Organize horários, profissionais, serviços e disponibilidade." action={<Button>Novo agendamento</Button>} />
    <StatGrid items={[{ label: 'Hoje', value: '0' }, { label: 'Confirmados', value: '0' }, { label: 'Pendentes', value: '0' }, { label: 'Disponibilidade', value: 'Livre', note: 'Sem conflitos' }]} />
    <ContentCard title="Agenda de hoje" description="Visualização rápida dos horários disponíveis." action={<div className="toolbar"><button>‹</button><Pill tone="brand">Hoje</Pill><button>›</button></div>}>
      <div className="schedule-grid">{hours.map((hour) => <div className="schedule-row" key={hour}><time>{hour}</time><button className="schedule-slot">Horário disponível</button></div>)}</div>
    </ContentCard>
  </>;
}
