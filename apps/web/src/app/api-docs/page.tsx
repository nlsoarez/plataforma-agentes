import Shell from '../../components/Shell';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function ApiDocsPage() {
  return (
    <Shell title="API Docs">
      <div className="nl-page-head nl-rise">
        <div>
          <h1>API pública</h1>
          <div className="sub">Use header x-api-key gerado em Integrações</div>
        </div>
        <a className="nl-btn nl-btn--accent" href="/integracoes">Gerar API key</a>
      </div>

      <section className="nl-card nl-card--pad" style={{ maxWidth: 900 }}>
        <h2 style={{ marginBottom: 12 }}>Endpoints</h2>
        <ApiBlock method="GET" path="/api/v1/leads" />
        <ApiBlock method="PATCH" path="/api/v1/leads/:leadNumber/notes" body={'{ "notes": "Cliente quer retorno amanha" }'} />
        <ApiBlock method="PATCH" path="/api/v1/leads/:leadNumber/properties" body={'{ "prop_name": "plano", "prop_value": "premium" }'} />
        <ApiBlock method="PATCH" path="/api/v1/leads/:leadNumber/kanban" body={'{ "column_id": "uuid-da-coluna" }'} />
        <ApiBlock method="POST" path="/api/v1/leads/:leadNumber/tags" body={'{ "tag": "lead-quente" }'} />
        <ApiBlock method="PATCH" path="/api/v1/leads/:leadNumber/tags/remove" body={'{ "tag": "lead-quente" }'} />
        <ApiBlock method="GET" path="/api/v1/messages/history?leadNumber=5511999999999" />
        <ApiBlock method="POST" path="/api/v1/messages/text" body={'{ "leadNumber": "5511999999999", "text": "Olá!" }'} />
        <ApiBlock method="POST" path="/api/v1/messages/media" body={'{ "leadNumber": "5511999999999", "mediaType": "image", "mediaUrl": "https://..." }'} />
      </section>
    </Shell>
  );
}

function ApiBlock({ method, path, body }: { method: string; path: string; body?: string }) {
  return (
    <div className="nl-api-block">
      <div><span>{method}</span> <code>{BASE}{path}</code></div>
      <pre>{`curl -X ${method} "${BASE}${path}" \\
  -H "x-api-key: SUA_CHAVE"`}{body ? ` \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'` : ''}</pre>
    </div>
  );
}
