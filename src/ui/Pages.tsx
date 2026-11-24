// Páginas institucionais: privacidade e "sobre e termos". Abertas pelo rodapé (#privacidade, #sobre).
import type { ReactNode } from "react";
import { Card } from "./common.tsx";
import { FEEDBACK_CONTACT, SOURCE_URL } from "./helpers.ts";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-stone-900">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-stone-700">{children}</div>
    </section>
  );
}

const ext = { target: "_blank", rel: "noreferrer noopener", className: "text-blue-800 underline underline-offset-2" } as const;

export function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Card label="Privacidade" className="space-y-6">
        <h1 className="text-xl font-semibold text-stone-900">Como o Anonimador protege seus documentos</h1>

        <Section title="Seu PDF não sai do seu computador">
          <p>
            Todo o processamento — leitura, sugestão de nomes, remoção e verificação — acontece dentro do seu navegador. O arquivo
            não é enviado a nenhum servidor: não existe servidor do Anonimador. O site é só um conjunto de arquivos estáticos (a
            página e o programa que lê PDFs) que o navegador baixa uma vez.
          </p>
          <p>Não há cadastro, cookies, publicidade nem ferramentas de estatística de acesso.</p>
        </Section>

        <Section title="Uma trava no próprio navegador">
          <p>
            A página declara uma política de segurança (Content Security Policy) que proíbe o navegador de enviar dados para
            qualquer endereço que não seja o próprio site, e de enviar formulários. Mesmo que algum código tentasse, o navegador
            bloquearia.
          </p>
        </Section>

        <Section title="Como conferir você mesmo">
          <p>
            Abra as ferramentas do desenvolvedor do navegador (tecla F12), vá à aba <strong>Rede</strong> e use o Anonimador
            normalmente: ao escolher e anonimizar o PDF, nenhuma requisição leva o seu documento para fora. O código é aberto e pode
            ser auditado:{" "}
            <a href={SOURCE_URL} {...ext}>
              código-fonte no GitHub
            </a>
            .
          </p>
        </Section>

        <Section title="O que fica com você">
          <p>
            A <strong>tabela de correspondência</strong> (marcador → dado real) é gerada no seu navegador e só existe no arquivo que
            você baixar. Guarde-a com cuidado e não a envie à IA: é ela que permite desfazer a anonimização.
          </p>
          <p>
            Com a tabela guardada, o resultado é <strong>pseudonimização</strong>, não anonimização: para a LGPD, o documento continua
            contendo dados pessoais enquanto for possível reverter. A redução de risco é grande, mas não elimina as obrigações de quem
            trata os dados.
          </p>
        </Section>

        <Section title="Hospedagem">
          <p>
            Os arquivos do site são servidos pelo GitHub Pages. Como qualquer site, o provedor de hospedagem pode registrar dados
            técnicos de acesso (como endereço IP e horário) — nunca o conteúdo dos seus documentos, que não trafega pela rede.
          </p>
        </Section>
      </Card>
    </div>
  );
}

export function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Card label="Sobre e termos" className="space-y-6">
        <h1 className="text-xl font-semibold text-stone-900">Sobre o Anonimador e termos de uso</h1>

        <Section title="O que é">
          <p>
            Uma ferramenta gratuita para remover dados pessoais de PDFs de processos antes de usá-los com ferramentas de inteligência
            artificial. Nomes, documentos, endereços, contatos, dados bancários, números de processo e códigos de verificação são
            removidos do próprio PDF e substituídos por marcadores, e depois os nomes podem ser devolvidos à resposta da IA.
          </p>
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
            Versão de teste (beta). Use com atenção e revise sempre o resultado.
          </p>
        </Section>

        <Section title="Limites — leia antes de usar">
          <ul className="list-disc space-y-1 pl-5">
            <li>Nenhuma detecção automática garante a remoção de todos os dados pessoais. A revisão é sua.</li>
            <li>
              Páginas escaneadas (sem texto) não são anonimizadas: o Anonimador avisa quais são, e elas precisam ser tratadas à parte.
            </li>
            <li>
              Dados indiretos — datas, profissão, local de trabalho, fatos muito específicos — podem identificar alguém e não são
              removidos.
            </li>
            <li>O PDF anonimizado não é documento oficial: assinaturas digitais deixam de valer.</li>
          </ul>
        </Section>

        <Section title="Termos de uso">
          <p>
            O Anonimador é oferecido gratuitamente, como está, sem garantia de qualquer tipo. Ao usá-lo, você continua responsável pelo
            tratamento dos dados pessoais dos documentos, pela conferência do resultado e pelo cumprimento da LGPD e dos deveres de sigilo
            da sua profissão. O autor não tem acesso aos documentos processados e não se responsabiliza por danos decorrentes do uso.
          </p>
        </Section>

        <Section title="Código aberto e créditos">
          <p>
            Código aberto sob a licença{" "}
            <a href="https://www.gnu.org/licenses/agpl-3.0.html" {...ext}>
              GNU AGPL-3.0
            </a>
            :{" "}
            <a href={SOURCE_URL} {...ext}>
              código-fonte no GitHub
            </a>
            .
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Leitura e edição de PDF:{" "}
              <a href="https://mupdf.com/" {...ext}>
                MuPDF
              </a>{" "}
              (Artifex Software, AGPL-3.0).
            </li>
            <li>
              Lista de primeiros nomes: IBGE — Censo 2010, tratada por Álvaro Justen /{" "}
              <a href="https://brasil.io/dataset/genero-nomes/" {...ext}>
                Brasil.IO
              </a>
              , sob licença Creative Commons Atribuição-CompartilhaIgual.
            </li>
          </ul>
        </Section>

        <Section title="Sugestões e problemas">
          {FEEDBACK_CONTACT ? (
            <p>
              Escreva para{" "}
              <a href={FEEDBACK_CONTACT.href} {...ext}>
                {FEEDBACK_CONTACT.label}
              </a>
              . <strong>Nunca envie PDFs de processos reais</strong> — descreva o problema (tipo de documento, o que passou, em que
              formato).
            </p>
          ) : (
            <p>
              Relate problemas{" "}
              <a href={`${SOURCE_URL}/issues`} {...ext}>
                no GitHub
              </a>
              . <strong>Nunca envie PDFs de processos reais</strong> — descreva o problema (tipo de documento, o que passou, em que
              formato).
            </p>
          )}
        </Section>
      </Card>
    </div>
  );
}
