# Changelog

## v0.1.0 — beta fechado (24/11/2026)

Primeira versão de teste do **Anonimador**, para um grupo pequeno de advogados (no endereço do GitHub Pages; o domínio anonimador.com.br vem depois).

**Anonimização no navegador**
- Remoção real dos dados no próprio PDF (MuPDF), com marcadores consistentes ([PESSOA_1], [CPF_2]…) e layout preservado
- Limpeza de metadados, anexos, formulários e anotações; texto anonimizado (.txt) para a IA
- Nenhum dado sai da máquina: sem servidor, sem analytics; CSP impede envio a terceiros

**O que é detectado**
- Pessoas e empresas (sugestões com base nos primeiros nomes do Censo 2010 do IBGE), grafias variantes, "Sr. Sobrenome",
  apelidos, iniciais; agentes públicos sugeridos mas desmarcados
- CPF, CNPJ (inclusive alfanumérico), PIS, RG, CNH, CTPS, título de eleitor, OAB, RENAVAM, placa, telefone, e-mail,
  endereço, CEP, agência/conta, PIX, data de nascimento, escola, números de processo, protocolos e códigos de verificação

**Interface em quatro etapas**
- Documento (com avisos de página escaneada, texto ilegível, assinatura digital e senha), Revisão (pré-visualização das
  páginas, lista editável, marcador previsto por pessoa, seleção de trecho na página), Resultado (verificação final) e
  Restaurar (devolve os nomes à resposta da IA)

**Qualidade**
- ~900 testes do motor; testes de interface contra o build de produção, incluindo "nenhuma requisição externa";
  100% de remoção em 50 layouts fictícios de processos do MPT

**Limites conhecidos**
- Páginas escaneadas não são anonimizadas (são avisadas); dados indiretos não são removidos; revisão é obrigatória
