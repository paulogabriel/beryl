# Beryl

Um painel local do seu trabalho com o Claude, instalado como plugin do Claude Code.

[English](README.md)

<img src="docs/galaxy-crt.jpg" alt="A vista Galaxy no tema CRT Berilo: cada braço é uma área, cada estrela uma conversa com o Claude">


O Beryl lê três fontes, todas opcionais:

- **Sessões do Claude Code** (`~/.claude/projects`), agrupadas em projetos por repositório git.
- **A exportação de dados do claude.ai**: o `.zip`, o `conversations.json` dele, ou uma pasta que recebe as exportações.
- **Uma pasta de notas em markdown**: um vault do Obsidian ou qualquer outra. Notas com `tipo: projeto` (ou `type: project`) viram projetos.

E mostra tudo no navegador, na sua própria máquina:

- **Painel:** projetos agrupados por área, com status, origem (Claude Code, claude.ai ou os dois), última atividade e número de conversas. Filtros, busca e duas formas de exibir: cards ou accordion.
- **Gráfico:** notas, projetos e links em 2D, 3D ou como **Galaxy**, em que cada braço é uma área e cada conversa com o Claude é uma estrela. A última sessão pulsa.
- **Linha do tempo:** uma barra por projeto, com as daily notes no eixo.
- **Leitor:** qualquer nota, conversa ou sessão numa janela de detalhes que você pode arrastar, com links de volta e as conversas ligadas a cada projeto.

<img src="docs/dashboard-crt.jpg" alt="O painel: projetos por área, com status, origem e conversas">

**Temas.** A lista no canto superior direito tem cinco visuais: **CRT Berilo** (o padrão) e **CRT Âmbar**, fósforo sobre preto com linhas de varredura, fonte de terminal e logo brilhante; e **Dashboard Automático**, **Claro** e **Escuro**, que seguem o sistema ou a sua escolha. A Galaxy assume o fósforo dos temas CRT. A escolha fica no seu navegador. Nos temas CRT o Beryl abre com uma tela de boot curta (logo, linhas de verificação e uma barra de carregamento que chega a 100% quando os dados estão prontos), uma vez por aba do navegador; qualquer tecla ou clique pula, e ela não aparece se o sistema pedir menos movimento.

<table><tr>
<td><img src="docs/galaxy-amber.jpg" alt="A Galaxy no tema CRT Âmbar"></td>
<td><img src="docs/dashboard-light.jpg" alt="O painel no tema Dashboard Claro"></td>
</tr></table>

Ele também dá a cada sessão do Claude Code o contexto do projeto dela, por um servidor MCP: o que é o projeto, o status, as decisões e o que já foi conversado. No fim da sessão, o Claude grava um resumo de uma linha no registro de sessões do projeto.

Nada sai da sua máquina. O painel é um servidor local em `127.0.0.1`.

O nome vem do berilo, a pedra das primeiras lentes de óculos e o oitavo fundamento da Nova Jerusalém (Apocalipse 21:20). Suas notas e conversas guardam; o Beryl deixa ver.

## Instalação

**Você precisa de:**

- **Claude Code** com suporte a plugins (o comando `/plugin`).
- **Python 3.9 ou mais novo.** No macOS, `xcode-select --install` instala; no Linux vem com a maioria das distribuições. Confira com `python3 --version`.
- **macOS ou Linux.** No Windows, use o WSL.

Nada mais para instalar: o Beryl usa só a biblioteca padrão do Python.

### 1. Instale o plugin

Digite no prompt do Claude Code (não no terminal):

```
/plugin marketplace add paulogabriel/beryl
/plugin install beryl@beryl
```

Ou pelo terminal:

```bash
claude plugin marketplace add paulogabriel/beryl
claude plugin install beryl@beryl
```

### 2. Escolha o que o Beryl lê

O Claude Code pede as opções do plugin. (Se você instalou pelo terminal, ele não pergunta: só avisa que as opções não estão definidas, e você as define com `/plugin configure beryl@beryl` no Claude Code.) Tudo é opcional: sem definir nada, o Beryl mostra as suas sessões do Claude Code, e o resto você acrescenta depois. Mude as opções quando quiser com `/plugin configure beryl@beryl`; o painel pega a mudança em poucos segundos.

| Opção | O que faz |
|---|---|
| Read Claude Code sessions | Mostra as sessões do Claude Code e agrupa em projetos. Ligada por padrão. |
| claude.ai data export | O `.zip` do claude.ai (Settings › Privacy › Export data), o `conversations.json` dele, ou uma pasta com exportações (vale a mais recente). Guarde-a num lugar seguro: veja abaixo. |
| Notes folder | Um vault do Obsidian ou qualquer pasta de notas em markdown. |
| Language | `auto` (a do sistema), `en` ou `pt`. As outras caem para o inglês. |
| Write to project notes | Deixa o Beryl mudar o status das notas de projeto e acrescentar resumos de sessão nelas. Desligada por padrão: os resumos ficam nos dados do próprio Beryl. |
| Beryl only in my projects | As sessões do Claude só recebem o contexto do Beryl nas pastas dos seus projetos e na pasta de notas, não em repositórios clonados de terceiros. Desligada por padrão. |

**Como obter a exportação do claude.ai.** No claude.ai, abra Settings › Privacy › Export data. O claude.ai envia por e-mail um link para baixar (o link expira, então baixe logo). Depois guarde-a num lugar seguro (veja abaixo) e informe ao Beryl esse arquivo ou a pasta. Sem a exportação o Beryl funciona do mesmo jeito; só não mostra as suas conversas do claude.ai. A exportação é uma foto do momento, então peça uma nova de vez em quando: o painel avisa quando a conversa mais recente tem mais de 14 dias.

**Guarde a exportação num lugar seguro.** A exportação tem o texto completo de todas as conversas que você já teve no claude.ai, então trate-a como um arquivo de senhas. O Beryl só a lê, no seu computador; o risco é onde você a deixa.

- Tire o `.zip` de Downloads e coloque numa pasta só sua, como `~/Privado/claude-export`, e tranque-a com `chmod 700 ~/Privado/claude-export`. Downloads é um lugar movimentado: navegadores, aplicativos e sites jogam arquivos lá.
- Não ponha num repositório git, numa pasta compartilhada com outras pessoas, nem numa pasta sincronizada que outros possam abrir.
- Mantenha a criptografia do disco ligada (FileVault no macOS, LUKS no Linux), para o arquivo continuar ilegível se o computador for perdido.
- Aponte o Beryl para esse `.zip` (ou para essa pasta), não para Downloads.
- Quando pedir uma exportação mais nova, substitua a antiga e apague-a, para não acumular cópias.
- Nunca compartilhe o `.zip` nem o arquivo gerado por `build` (veja "Privacidade e segurança").

O que o Beryl faz com senhas, chaves e outros dados sensíveis: veja "Senhas, chaves e outras informações sensíveis" abaixo.

### 3. Abra uma sessão nova do Claude Code

Feche a sessão atual e abra outra, para o servidor MCP e os hooks carregarem.

### 4. Abra o painel

Na sessão nova:

```
/beryl:dashboard
```

Na primeira vez, o Claude Code pede permissão para rodar `python3`: é o servidor local do Beryl começando. O navegador abre então o painel. O servidor continua rodando em segundo plano e a página se atualiza sozinha; ele para depois de 2 horas sem o painel aberto, e `/beryl:dashboard` liga de novo.

Se você também deu uma exportação do claude.ai ao Beryl, rode `/beryl:organize` uma vez: o Claude propõe um projeto ou uma área para cada conversa e salva depois que você aprovar.

### Atualizar e desinstalar

```bash
claude plugin update beryl@beryl      # versão mais nova (ou /plugin update)
claude plugin uninstall beryl@beryl   # remove o plugin
```

Os dados do próprio Beryl (itens ocultos, conversas organizadas, a chave do servidor em execução) ficam em `~/.claude/plugins/data/beryl-beryl`. Apague essa pasta para removê-los. Suas notas nunca são apagadas.

### Se algo der errado

| O que você vê | O que fazer |
|---|---|
| `python3: command not found`, ou Python mais velho que 3.9 | Instale o Python 3.9 ou mais novo (veja "Você precisa de") e rode `/beryl:dashboard` de novo. |
| O navegador não abriu | Rode `/beryl:dashboard` de novo e abra o endereço que ele mostra. |
| "Este endereço precisa da chave do servidor em execução" | Abra o painel com `/beryl:dashboard`, não com um endereço antigo: a chave do endereço vale uma vez. |
| Faixa "Servidor do Beryl desligado" na página | O servidor parou (inatividade ou desligado). Rode `/beryl:dashboard`. |
| "Nenhuma fonte configurada" | Ligue Read Claude Code sessions, ou informe uma exportação do claude.ai ou uma pasta de notas, com `/plugin configure beryl@beryl`. |
| A porta 8765 está ocupada por outro programa | Defina outra `port` no seu arquivo de configurações (veja "Suas configurações"). |
| As conversas do claude.ai não aparecem | Confira o caminho da exportação. Se for uma pasta, ela precisa ter uma exportação completa (`conversations.json` com `users.json`). |

## Uso

| Comando | O que faz |
|---|---|
| `/beryl:dashboard` | Abre o painel no navegador. O servidor continua rodando em segundo plano e a página se atualiza sozinha. Na primeira vez, o Claude Code pede permissão para rodar o `python3`: é o servidor local do Beryl ligando. |
| `/beryl:save` | Grava um resumo curto da sessão no registro de sessões do projeto. |
| `/beryl:organize` | Organiza as conversas do claude.ai: o Claude propõe um projeto ou uma área para cada uma e grava depois da sua aprovação. |
| `/beryl:week` | Um resumo dos últimos 7 dias (ou `/beryl:week 14`), por projeto: o que andou, decisões e o que está pendente. |

Sem comando nenhum, o Claude chama `beryl_context` quando você começa a trabalhar num projeto. No fim da sessão ou no `/compact`, um hook grava um registro automático, se ninguém gravou.

### Como os projetos são encontrados

- **Pelas notas:** uma nota com `tipo: projeto` (ou `type: project`) é um projeto. A propriedade `pasta` (ou `folder`) liga a nota às pastas onde você trabalha nele; separe várias pastas com `·`.
- **Pelo Claude Code:** sessões numa pasta que nenhuma nota de projeto cobre viram um projeto por repositório git, ativo se teve sessão nos últimos 30 dias.
- **Pelo claude.ai:** a exportação não diz a qual Project cada conversa pertence, então as conversas novas chegam sem organização. Rode `/beryl:organize` para organizá-las.

As propriedades das notas podem estar em português ou em inglês: `tipo`/`type`, `status`, `area`, `pasta`/`folder`, `ultima_atividade`/`last_activity`, `origem`/`origin`.

### Ferramentas do MCP

| Ferramenta | O que devolve |
|---|---|
| `beryl_context` | O projeto da pasta atual (ou um projeto pelo nome): nota, status, decisões, registro de sessões e conversas recentes. |
| `beryl_search` | Notas e conversas que citam um termo. |
| `beryl_projects` | Todos os projetos, com id, status, área e última atividade. |
| `beryl_save_session` | Grava um resumo no registro de sessões do projeto da pasta atual. |

## Experimente sem os seus dados

A pasta `demo/` tem notas, uma exportação do claude.ai e sessões do Claude Code, tudo fictício:

```bash
python3 beryl.py --config demo/beryl.json serve
```

## Privacidade e segurança

- O servidor só escuta em `127.0.0.1` e só atende pedidos endereçados a ele (checagem de `Host` e `Origin`), o que bloqueia DNS rebinding. Outros sites não leem seus dados nem embutem o painel (CSP com `frame-ancestors 'none'`).
- Cada execução do servidor tem uma chave secreta própria. O navegador que o Beryl abre recebe a chave num cookie; outros programas do computador que acessem `127.0.0.1` não recebem dados sem ela.
- A pasta de dados (com a exportação do claude.ai e a chave) só pode ser lida pelo seu usuário.
- O servidor para sozinho depois de `idle_minutes` (2 horas) sem painel aberto, ou pelo botão "desligar servidor"; `/beryl:dashboard` liga de novo.
- Gravações só aceitam JSON da própria página do Beryl, até 64 KB, e só o status de notas de projeto graváveis.
- Títulos, resumos e primeiros pedidos passam por um filtro que mascara chaves de API, tokens e chaves privadas. O filtro funciona por formatos conhecidos: uma senha solta ou um token de formato incomum pode passar, então não conte com ele como única proteção.
- O MCP só mostra a outras sessões as notas de projeto e as conversas já organizadas, e nada das áreas em `mcp_hidden_areas` (por padrão `personal` e `pessoal`). Conversas sem organização ficam de fora.
- A pasta da sessão é a pasta de trabalho do próprio servidor MCP, não o `CLAUDE_PROJECT_DIR`, que um repositório poderia definir nas próprias configurações.
- A chave no endereço que o Beryl abre vale uma vez: um endereço que ficou no histórico do navegador não abre nada.
- Quando a exportação configurada é uma pasta (como Downloads), só conta uma exportação completa do claude.ai (`conversations.json` com `users.json`), então um arquivo que algum site jogue ali não vira a sua exportação. Exportações acima de 2 GB não são lidas.
- `beryl_save_session` só grava no projeto da pasta real da sessão: um README malicioso num repositório qualquer não faz o Claude escrever no registro de outro projeto. O que o Beryl devolve ao Claude vem marcado como dado, não como instrução.
- Resumos de sessão são gravados em uma linha só, sem links, imagens, HTML ou `%%`.
- Servidor, MCP e hooks gravam sob uma trava de arquivo compartilhada.
- `python3 beryl.py build` gera um HTML único, somente leitura, com os títulos e resumos das suas conversas e o texto completo das suas notas: não compartilhe.

### Senhas, chaves e outras informações sensíveis

**O que o Beryl lê e mostra**

- **Exportação do claude.ai:** só o título, o resumo, as datas e o número de mensagens de cada conversa. Não mostra o texto das suas mensagens nem das respostas do Claude.
- **Sessões do Claude Code:** o título, o primeiro pedido, as pastas e as datas. Não mostra as respostas do Claude, os comandos que ele rodou nem os arquivos que ele leu. (O arquivo da sessão é lido para achar isso, e só isso é guardado.)
- **Notas:** aparecem como estão, por inteiro, porque são suas.

**O que o filtro faz.** Títulos, resumos, primeiros pedidos e resumos de sessão passam por um filtro antes de chegar ao painel, ao MCP, ao registro de sessões ou a um arquivo do `build`. Ele esconde chaves privadas, chaves de API (Anthropic, OpenAI), tokens do GitHub, chaves de acesso da AWS, chaves de API do Google, tokens do Slack, tokens `Bearer` e qualquer sequência de 40 ou mais letras e números. Ele **não** pega uma senha escrita em texto comum ("minha senha é ..."), números de cartão ou de documentos, códigos de recuperação, nem chaves em formato incomum. É uma rede de segurança, não uma garantia.

**As notas não passam pelo filtro.** Se você escreveu uma senha ou uma chave numa nota, o painel a mostra, um arquivo feito com `build` a leva junto, e o MCP pode entregar ao Claude o começo de uma nota de projeto. Não guarde segredos em notas que o Beryl lê: use um gerenciador de senhas.

**Para onde vão as informações.** O Beryl em si não faz chamadas de rede e não envia nada a lugar nenhum. Mas o que o MCP devolve ao Claude (uma nota de projeto, títulos e resumos) passa a fazer parte daquela sessão do Claude Code, que o Claude Code envia à Anthropic como todo o resto da sessão. Para deixar algo de fora:

- ponha a área dele em `mcp_hidden_areas` (por padrão `personal` e `pessoal`);
- ligue "Beryl only in my projects";
- deixe as conversas sem organizar: o MCP só mostra as que você organizou;
- liste em `exclude` as pastas que o Beryl nunca deve ler.

Os resumos de sessão (filtrados, em uma linha) vão para a nota de registro do projeto se "Write to project notes" estiver ligada e, senão, para a pasta de dados do próprio Beryl, que só o seu usuário lê.

## Sem o Claude Code

O Beryl também roda sozinho:

```bash
python3 beryl.py serve              # site local que se atualiza sozinho
python3 beryl.py open               # liga o servidor em segundo plano, se preciso, e abre o navegador
python3 beryl.py build -o out.html  # um HTML único, somente leitura
```

As configurações vêm então de um `beryl.json` ao lado do `beryl.py` (veja `beryl.example.json`) ou do caminho em `BERYL_CONFIG`. No macOS, `scripts/make-app.sh` cria o `~/Applications/Beryl.app`, com o ícone do Beryl, para o Dock.

O Beryl roda no computador, junto dos seus arquivos: não dá para instalá-lo no celular, e o servidor recusa conexões de outros aparelhos de propósito. No celular você pode abrir o arquivo gerado por `build` (mande para você mesmo, por exemplo por AirDrop): é uma foto do momento em que foi gerado e não se atualiza.

## Suas configurações

O Beryl separa duas coisas:

- **Padrões**, no código: genéricos, iguais para todo mundo, atualizados junto com o Beryl.
- **As suas configurações**, num arquivo local que as atualizações nunca mexem: o `beryl.json` na pasta de dados do Beryl (`~/.claude/plugins/data/beryl-beryl/beryl.json` quando instalado como plugin, ou o caminho em `BERYL_CONFIG`). As convenções das suas notas (seus valores de `tipo`, seus status, suas áreas) vão ali.

Chave que você não puser fica com o padrão. As opções do plugin continuam valendo para as quatro fontes.

Exemplo, para notas que usam `tipo: projeto-claude` e um status próprio:

```json
{
  "project_types": ["projeto-claude", "projeto"],
  "statuses": ["ativo", "pausado", "funcional", "encerrado"],
  "status_groups": {"ativo": ["funcional"]},
  "area_order": ["trabalho", "estudos"]
}
```

Aqui `funcional` conta como projeto ativo. Os nomes dos grupos em `status_groups` são fixos (`ativo`, `pausado`, `continuo`, `ideia`, `encerrado`), em qualquer idioma.

| Chave | Padrão | O que faz |
|---|---|---|
| `notes`, `claude_code`, `claude_export`, `write_notes`, `mcp_only_projects` | | O mesmo que as opções do plugin. |
| `language` | `auto` | `en`, `pt` ou `auto` (o do sistema; no painel, o do navegador). |
| `port` | `8765` | Porta do servidor local. |
| `export_warn_days` | `14` | O painel avisa quando a conversa mais recente da exportação do claude.ai é mais antiga que isso; `0` desliga. |
| `idle_minutes` | `120` | O servidor para depois desse tempo sem painel aberto; `0` mantém ligado. |
| `write_dirs` | | Pastas das notas em que o Beryl pode gravar, no lugar de "notas de projeto". |
| `exclude` | `[]` | Pastas ou arquivos das notas que nunca são lidos. |
| `project_types` | `projeto`, `project` | Valores de `tipo` (ou `type`) que fazem de uma nota um projeto. |
| `statuses` | conforme o idioma | Opções de status na janela de detalhes. |
| `status_groups` | | Suas próprias palavras de status para as cores e filtros: `{"ativo": [...], "pausado": [...], "continuo": [...], "ideia": [...], "encerrado": [...]}`. As palavras comuns (ativo, pausado, ideia, encerrado…) já são conhecidas. |
| `auto_projects` | `true` | Pastas do Claude Code sem nota de projeto viram projetos. |
| `organize_file` | `organizacao.json` na pasta de dados | Onde ficam a organização das conversas e os itens ocultos. Caminho relativo parte da pasta de notas. |
| `mcp_hidden_areas` | `personal`, `pessoal` | Áreas que o MCP nunca mostra às sessões. O painel continua mostrando. |
| `mcp_folders` | | Pastas das notas que o MCP pode mostrar além das notas de projeto (`.` é a raiz). |
| `claude_folder` | | Pasta das notas mantida pelo Claude (logs, decisões), mostrada como "Memória do Claude". |
| `user_name` | | Como o MCP se refere a você. |
| `galaxy_core` | | Id (nome do arquivo sem `.md`) da nota no centro da Galaxy. |
| `area_order` | | Ordem das áreas no painel; as outras vêm depois, em ordem alfabética. |

## Deletar

Na janela de detalhes, **Deletar…** pede confirmação antes. Uma conversa só some do Beryl: ela continua no claude.ai ou no Claude Code. Uma nota gravável vai para a Lixeira.

## Idiomas

O painel e o que o Beryl escreve seguem a opção `language`: `auto` (o do sistema), `en` ou `pt`. Idiomas que o Beryl ainda não tem caem no inglês. Acrescentar um é um arquivo só: veja o [CONTRIBUTING.md](CONTRIBUTING.md).

## Desenvolvimento

```bash
python3 -m unittest discover -s tests   # testes, sobre os dados da demo
scripts/release.sh X.Y.Z                 # na main: testes, validação do plugin, versão, tag e push
```

As mudanças vão no `CHANGELOG.md`, em `## Unreleased`. Os testes rodam no macOS e no Linux, Python 3.9 e 3.13, a cada pull request.

## Licença

MIT
