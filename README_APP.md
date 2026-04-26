# Fabrica de Anuncios App

Base web para levar o projeto para GitHub, Vercel e Supabase.

## Stack

- `Next.js` na Vercel para app e APIs
- `Supabase` para Postgres e futuras integrações com Storage/Auth
- `Python` atual preservado no repositório como motor de geração

## Modo demo

Sem variáveis do Supabase, o app roda em `demo mode` e persiste localmente em:

- `.app-data/dashboard.json`

## Variáveis

Copie `.env.example` para `.env.local` e preencha:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

## Subir no GitHub

1. Criar repositório
2. Commitar este projeto
3. Subir para o GitHub

## Vercel

1. Importar o repositório na Vercel
2. Configurar as variáveis de ambiente
3. Deploy

Docs oficiais:

- [Vercel Functions](https://vercel.com/docs/functions/)
- [Python Runtime](https://vercel.com/docs/functions/runtimes/python)

## Supabase

1. Criar projeto
2. Rodar `supabase/schema.sql`
3. Copiar URL e keys para as variáveis do app

Docs oficiais:

- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)

## Próxima integração

O próximo passo é conectar o formulário de briefing à pipeline Python atual, trocando o placeholder da fila por:

- criação de job real
- execução do gerador
- gravação do resultado no banco
- aprovação/reprovação pelo painel
