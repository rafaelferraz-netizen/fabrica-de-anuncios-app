"use client";

import { useState, useTransition } from "react";
import { 
  Plus, 
  Users, 
  Briefcase, 
  Zap, 
  CheckCircle, 
  Clock,
  MoreVertical,
  Layout,
  ExternalLink,
  Target
} from "lucide-react";
import type { DashboardSnapshot } from "@/lib/types";
import { Button, Card, Input, Badge, cn } from "./ui-base";

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
  const [view, setView] = useState<'clients' | 'jobs'>('clients');

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

  const selectedClient = data.clients.find(c => c.id === selectedClientId);

  return (
    <div className="flex h-screen bg-white overflow-hidden text-slate-900">
      
      {/* SIDEBAR */}
      <aside className="w-64 border-r border-slate-100 flex flex-col p-6 bg-slate-50/30">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">F</div>
          <span className="font-bold text-lg tracking-tight">Fábrica AI</span>
        </div>

        <nav className="space-y-1 flex-1">
          <button 
            onClick={() => setView('clients')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
              view === 'clients' ? "bg-white text-indigo-600 shadow-sm border border-slate-100" : "text-slate-500 hover:text-slate-900"
            )}
          >
            <Users className="w-4 h-4" /> Clientes
          </button>
          <button 
            onClick={() => setView('jobs')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
              view === 'jobs' ? "bg-white text-indigo-600 shadow-sm border border-slate-100" : "text-slate-500 hover:text-slate-900"
            )}
          >
            <Zap className="w-4 h-4" /> Jobs de Produção
          </button>
        </nav>

        <div className="mt-auto">
          <Card className="p-4 bg-indigo-600 text-white border-none">
            <p className="text-xs font-medium text-indigo-100 mb-1 uppercase tracking-wider">Status do Sistema</p>
            <p className="text-sm font-bold">{data.mode === 'demo' ? 'Modo Demonstração' : 'Produção Ativa'}</p>
          </Card>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 flex flex-col overflow-hidden">
        
        {/* HEADER */}
        <header className="h-20 border-b border-slate-100 flex items-center justify-between px-8 bg-white/80 backdrop-blur-md z-20">
          <div>
            <h1 className="text-xl font-bold">{view === 'clients' ? 'Meus Clientes' : 'Fila de Produção'}</h1>
            <p className="text-xs text-slate-400 font-medium">Gerencie sua operação criativa</p>
          </div>
          <div className="flex items-center gap-3">
            {view === 'clients' ? (
              <Button onClick={() => setView('clients')} className="gap-2">
                <Plus className="w-4 h-4" /> Adicionar Cliente
              </Button>
            ) : (
              <Button onClick={() => setView('jobs')} className="gap-2">
                <Zap className="w-4 h-4" /> Novo Job
              </Button>
            )}
          </div>
        </header>

        {/* ÁREA DE SCROLL */}
        <div className="flex-1 overflow-y-auto p-8 bg-white">
          
          {view === 'clients' && (
            <div className="max-w-5xl mx-auto space-y-8">
              {/* Formulário Rápido */}
              <section className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                <div className="space-y-1.5 md:col-span-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Nome da Marca</label>
                  <Input 
                    placeholder="Ex: Coca Cola" 
                    value={clientForm.name} 
                    onChange={e => setClientForm({...clientForm, name: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5 md:col-span-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Segmento</label>
                  <Input 
                    placeholder="Ex: Bebidas" 
                    value={clientForm.segment} 
                    onChange={e => setClientForm({...clientForm, segment: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5 md:col-span-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Tom de Voz</label>
                  <Input 
                    placeholder="Ex: Alegre" 
                    value={clientForm.brandTone} 
                    onChange={e => setClientForm({...clientForm, brandTone: e.target.value})}
                  />
                </div>
                <Button 
                  disabled={pending || !clientForm.name}
                  onClick={async () => {
                    await postJson("/api/clients", clientForm);
                    setClientForm({ name: "", segment: "", brandTone: "" });
                    refreshSnapshot();
                  }}
                >
                  Salvar
                </Button>
              </section>

              {/* Lista de Clientes */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {data.clients.map(client => (
                  <Card 
                    key={client.id} 
                    className={cn(
                      "p-6 transition-all group relative overflow-hidden",
                      selectedClientId === client.id ? "border-indigo-200 ring-4 ring-indigo-50" : "hover:border-slate-200"
                    )}
                  >
                    <div className="flex justify-between items-start mb-6">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                        <Users className="w-6 h-6" />
                      </div>
                      <Badge variant={selectedClientId === client.id ? 'indigo' : 'default'}>
                        {client.brandTone}
                      </Badge>
                    </div>
                    
                    <h3 className="text-lg font-bold mb-1">{client.name}</h3>
                    <p className="text-sm text-slate-500 mb-6">{client.segment}</p>
                    
                    <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Ativo desde {new Date(client.createdAt).toLocaleDateString()}</div>
                      <Button 
                        variant={selectedClientId === client.id ? 'primary' : 'outline'} 
                        className="h-9 px-4 text-xs"
                        onClick={() => setSelectedClientId(client.id)}
                      >
                        {selectedClientId === client.id ? 'Selecionado' : 'Selecionar'}
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {view === 'jobs' && (
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="flex items-center justify-between bg-slate-900 p-8 rounded-3xl text-white mb-10 overflow-hidden relative">
                <Zap className="absolute -right-10 -top-10 w-48 h-48 text-white/5 rotate-12" />
                <div className="relative z-10">
                  <h2 className="text-2xl font-bold mb-2">Novo Anúncio</h2>
                  <p className="text-slate-400 text-sm max-w-sm">Selecione um cliente e defina o produto para iniciar a geração por IA.</p>
                </div>
                <div className="flex gap-3 relative z-10">
                   <select 
                    className="h-12 rounded-xl bg-white/10 border border-white/20 px-4 text-sm text-white outline-none focus:ring-2 focus:ring-white/30"
                    value={briefingForm.clientId}
                    onChange={e => setBriefingForm({...briefingForm, clientId: e.target.value})}
                  >
                    <option value="" className="text-slate-900">Selecionar Cliente...</option>
                    {data.clients.map(c => <option key={c.id} value={c.id} className="text-slate-900">{c.name}</option>)}
                  </select>
                  <Input 
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/40 h-12"
                    placeholder="Nome do Produto" 
                    value={briefingForm.productName}
                    onChange={e => setBriefingForm({...briefingForm, productName: e.target.value})}
                  />
                  <Button 
                    variant="primary" 
                    className="bg-white text-slate-900 hover:bg-slate-100"
                    disabled={pending || !briefingForm.clientId || !briefingForm.productName}
                    onClick={async () => {
                      await postJson("/api/briefings", briefingForm);
                      setBriefingForm({...briefingForm, productName: "", objective: ""});
                      refreshSnapshot();
                    }}
                  >
                    Lançar Job
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                {data.jobs.map(job => {
                  const briefing = data.briefings.find(b => b.id === job.briefingId);
                  const client = data.clients.find(c => c.id === briefing?.clientId);
                  return (
                    <Card key={job.id} className="p-6 flex items-center justify-between hover:shadow-md transition-all">
                      <div className="flex items-center gap-6">
                        <div className={cn(
                          "w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-sm",
                          job.status === 'approved' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : 
                          job.status === 'rejected' ? "bg-rose-50 text-rose-600 border border-rose-100" : 
                          "bg-indigo-50 text-indigo-600 border border-indigo-100 animate-pulse"
                        )}>
                          {job.status === 'approved' ? <CheckCircle className="w-7 h-7" /> : <Clock className="w-7 h-7" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">{client?.name}</span>
                          </div>
                          <h3 className="font-bold text-lg leading-tight">{briefing?.productName || "Sem Nome"}</h3>
                          <p className="text-sm text-slate-400 mt-1 flex items-center gap-2">
                             <Target className="w-3 h-3" /> {briefing?.objective || "Geração de criativo"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right hidden md:block">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Status Atual</p>
                          <Badge variant={job.status === 'approved' ? 'success' : job.status === 'rejected' ? 'destructive' : 'indigo'}>
                            {job.status === 'queued' ? 'Na Fila' : job.status}
                          </Badge>
                        </div>
                        <Button variant="outline" className="h-10 px-6 rounded-xl text-xs gap-2">
                          Abrir Detalhes <ExternalLink className="w-3 h-3" />
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}