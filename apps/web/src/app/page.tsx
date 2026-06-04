export default function Home() {
  const link = { display: 'block', margin: '8px 0' };
  return (
    <main style={{ fontFamily: 'sans-serif', padding: 40 }}>
      <h1>Painel da agência</h1>
      <p>Plataforma white-label de agentes no WhatsApp.</p>
      <a style={link} href="/login">Login</a>
      <a style={link} href="/inbox">Inbox ao vivo</a>
      <a style={link} href="/pipeline">Pipeline (Kanban)</a>
      <a style={link} href="/campanhas">Campanhas</a>
      <a style={link} href="/billing">Assinatura</a>
      <a style={link} href="/onboarding">Conectar WhatsApp</a>
    </main>
  );
}
