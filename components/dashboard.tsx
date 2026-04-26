"use client";

import { useState, useTransition } from "react";
import { 
  PlusCircle, 
  Users, 
  ClipboardList, 
  PlayCircle, 
  CheckCircle2, 
  LayoutDashboard,
  ChevronRight,
  Search
} from "lucide-react";
import type { DashboardSnapshot } from "@/lib/types";
import { Button, Card, Input, Badge } from "./ui-base";

type Props = {
  initialData: DashboardSnapshot;
};

async function postJson(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export function Dashboard({ initialData }: Props) {
  const [data, setData] = useState(initialData);
  const [pending, startTransition] = useTransition();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const [clientForm, setClientForm] = useState({ name: "", segment: "", brandTone: "" });
  const [briefingForm, setBriefingForm] = useState({
    clientId: "",
    productName: "",
    platform: "Instagram",
    format: "4:5 (1080x1350px)",
    adType: "static" as "static" | "carousel",
    objective: "",
    funnelStage: "",
    productImageUrl: "",
    referenceAdUrl: ""
  });

  function refreshSnapshot() {
    startTransition(async () => {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const nextData = (await response.json()) as DashboardSnapshot;
      setData(nextData);
    });
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header do App */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="w-6 h-6 text-indigo-600" />
          <h1 className="text-xl font-bold tracking-tight">Fábrica de Anúncios</h1>
          <Badge variant="default" className="ml-2 bg-indigo-50 text-indigo-700 border-indigo-100">
            {data.mode === 'demo' ? 'Modo Demo' : 'Supabase'}
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-500">
          <span className="flex items-center gap-1"><Users className="w-4 h-4" /> {data.clients.length} Clientes</span>
          <span className="flex items-center gap-1"><ClipboardList className="w-4 h-4" /> {data.jobs.length} Jobs</span>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Coluna Esquerda: Ações e Formulários */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="p-5">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-indigo-600" /> Novo Cliente
            </h2>
            <div className="space-y-3">
              <Input 
                placeholder="Nome da Empresa" 
                value={clientForm.name} 
                onChange={e => setClientForm({...clientForm, name: e.target.value})}
              />
              <Input 
                placeholder="Segmento" 
                value={clientForm.segment} 
                onChange={e => setClientForm({...clientForm, segment: e.target.value})}
              />
              <Input 
                placeholder="Tom da Marca" 
                value={clientForm.brandTone} 
                onChange={e => setClientForm({...clientForm, brandTone: e.target.value})}
              />
              <Button 
                className="w-full" 
                disabled={pending || !clientForm.name}
                onClick={async () => {
                  await postJson("/api/clients", clientForm);
                  setClientForm({ name: "", segment: "", brandTone: "" });
                  refreshSnapshot();
                }}
              >
                Cadastrar Cliente
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <PlayCircle className="w-5 h-5 text-indigo-600" /> Iniciar Novo Job
            </h2>
            <div className="space-y-3 text-sm">
              <select 
                className="w-full h-10 rounded-md border border-slate-200 bg-white px-3"
                value={briefingForm.clientId}
                onChange={e => setBriefingForm({...briefingForm, clientId: e.target.value})}
              >
                <option value="">Selecionar Cliente...</option>
                {data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <Input 
                placeholder="Nome do Produto" 
                value={briefingForm.productName}
                onChange={e => setBriefingForm({...briefingForm, productName: e.target.value})}
              />
              <Input 
                placeholder="Objetivo (ex: Vendas)" 
                value={briefingForm.objective}
                onChange={e => setBriefingForm({...briefingForm, objective: e.target.value})}
              />
              <Button 
                variant="outline" 
                className="w-full border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                disabled={pending || !briefingForm.clientId || !briefingForm.productName}
                onClick={async () => {
                  await postJson("/api/briefings", briefingForm);
                  setBriefingForm({...briefingForm, productName: "", objective: ""});
                  refreshSnapshot();
                }}
              >
                Gerar Briefing & Job
              </Button>
            </div>
          </Card>
        </div>

        {/* Coluna Direita: Listas de "Coisas Inscritas" */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Seção de Clientes com Botão de Seleção */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Users className="w-5 h-5" /> Clientes Ativos
              </h2>
              <div className="relative w-48">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <Input className="pl-9 h-9 text-xs" placeholder="Buscar cliente..." />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.clients.map(client => (
                <Card 
                  key={client.id} 
                  className={cn(
                    "p-4 hover:border-indigo-300 transition-all cursor-pointer group",
                    selectedClientId === client.id && "border-indigo-600 bg-indigo-50/30 ring-1 ring-indigo-600"
                  )}
                  onClick={() => setSelectedClientId(client.id)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-slate-900">{client.name}</h3>
                      <p className="text-xs text-slate-500 mt-1">{client.segment}</p>
                    </div>
                    <Button 
                      variant="outline" 
                      className="h-8 w-8 p-0 rounded-full group-hover:bg-indigo-600 group-hover:text-white"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Badge className="bg-slate-100 text-[10px] uppercase">{client.brandTone}</Badge>
                  </div>
                </Card>
              ))}
              {data.clients.length === 0 && (
                <div className="col-span-2 py-12 text-center text-slate-400 border-2 border-dashed rounded-lg border-slate-200">
                  Nenhum cliente cadastrado ainda.
                </div>
              )}
            </div>
          </section>

          {/* Seção de Jobs na Fila */}
          <section>
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <ClipboardList className="w-5 h-5" /> Fila de Produção
            </h2>
            <div className="space-y-3">
              {data.jobs.map(job => {
                const briefing = data.briefings.find(b => b.id === job.briefingId);
                const client = data.clients.find(c => c.id === briefing?.clientId);
                return (
                  <Card key={job.id} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center",
                        job.status === 'approved' ? "bg-green-100 text-green-600" : 
                        job.status === 'rejected' ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600 animate-pulse"
                      )}>
                        {job.status === 'approved' ? <CheckCircle2 className="w-5 h-5" /> : <PlayCircle className="w-5 h-5" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-sm">{briefing?.productName || "Sem Nome"}</h3>
                          <span className="text-xs text-slate-400">•</span>
                          <span className="text-xs font-bold text-slate-600">{client?.name}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-1 max-w-md">
                          {job.outputSummary || "Aguardando processamento..."}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={job.status === 'approved' ? 'success' : job.status === 'rejected' ? 'destructive' : 'default'}>
                        {job.status}
                      </Badge>
                      <Button variant="outline" className="text-xs h-8">Ver Job</Button>
                    </div>
                  </Card>
                );
              })}
              {data.jobs.length === 0 && (
                <div className="py-8 text-center text-slate-400">
                  Nenhum job em andamento.
                </div>
              )}
            </div>
          </section>

        </div>
      </main>

      <footer className="p-6 text-center text-xs text-slate-400 border-t border-slate-200 mt-auto">
        &copy; {new Date().getFullYear()} Fábrica de Anúncios AI • Tecnologia de Ponta para Performance
      </footer>
    </div>
  );
}