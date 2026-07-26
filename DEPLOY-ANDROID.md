# Gerando o APK do Cofre (Android / Capacitor)

O Cofre continua sendo um app web puro. O Capacitor gera um APK que exibe o app
num WebView em tela cheia. Não há código nativo próprio — o React, o Supabase e
as RPCs seguem exatamente iguais.

## Modo atual: REMOTO (o APK carrega o site publicado)

`capacitor.config.json` tem `server.url` apontando para
`https://minitecnico-projeto-financas-pessoa.vercel.app`.

**Consequência prática: `vercel --prod` atualiza o app.** Não é preciso gerar
APK novo a cada mudança de front — basta o usuário reabrir o app.

Só é preciso gerar e reinstalar o APK quando mudar algo **fora** do bundle web:
ícone, splash, nome, `appId` ou o próprio `server.url`.

| O que você muda | Chega no celular sozinho? |
|---|---|
| React (telas, componentes, CSS, services, hooks) | **sim**, no próximo deploy |
| `api/ai-chat.js` | **sim**, no próximo deploy |
| Supabase (RPCs, schema, RLS) | **sim**, imediatamente |
| Ícone, splash, nome do app, `appId`, `server.url` | **não** — exige APK novo |

### O que isso custa

- **Primeira abertura exige internet.** Depois disso o service worker (`sw.js`)
  cacheia o app shell e ele abre offline.
- **Google Play pode recusar.** Um app que só exibe um site cai na política de
  "funcionalidade mínima". Para publicar na loja, o caminho sancionado pelo
  Google é TWA (Trusted Web Activity), não Capacitor com `server.url`.
- O `dist/` continua sendo empacotado dentro do APK, mas **fica sem uso** —
  o WebView carrega o site remoto.

### Voltando para o modo EMPACOTADO

Remova a linha `"url"` de `server` em `capacitor.config.json` e rode
`npm run android:apk`. Aí valem as regras opostas: funciona 100% offline desde a
primeira abertura, e toda mudança de front exige APK novo. Nesse modo o
`VITE_API_BASE_URL` do `.env` volta a ser obrigatório (ver seção 2).

---

## 1. Pré-requisitos (já instalados nesta máquina)

| Item | Onde ficou | Como conferir |
|---|---|---|
| JDK 21 (Temurin) | `~/.jdks/jdk-21.0.12+8` | `javac -version` |
| Android SDK | `~/Android/Sdk` | `sdkmanager --version` |
| Build-tools 35 + Platform 35 | `~/Android/Sdk` | `ls ~/Android/Sdk/platforms` |

O `openjdk` do sistema é **só JRE** (não tem `javac`), então o JDK do Temurin
está fixado em `~/.gradle/gradle.properties`:

```properties
org.gradle.java.home=/home/suporte/.jdks/jdk-21.0.12+8
```

Isso é o que realmente faz o build funcionar — arquivo de usuário, fora do repo,
válido em qualquer shell. As variáveis `JAVA_HOME`, `ANDROID_HOME` e o `PATH`
também foram adicionadas ao `~/.bashrc` (bloco `COFRE_ANDROID_BUILD`), mas
servem só para uso interativo (`adb`, `sdkmanager` na mão): o `.bashrc` retorna
cedo em shell não-interativo, então o Gradle nunca as enxerga.

O caminho do SDK também está em `frontend/android/local.properties` — arquivo
local, não versionado. Em outra máquina, recrie com:

```bash
echo "sdk.dir=$HOME/Android/Sdk" > frontend/android/local.properties
```

### Reinstalar a toolchain do zero (outra máquina)

```bash
# JDK 21 (sem sudo)
mkdir -p ~/.jdks && cd ~/.jdks
curl -L -o jdk21.tar.gz "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse"
tar -xzf jdk21.tar.gz

# Android SDK — só as command line tools (~350 MB no total, não os ~3 GB do Android Studio)
mkdir -p ~/Android/Sdk/cmdline-tools && cd ~/Android/Sdk/cmdline-tools
curl -L -o cli.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip -q cli.zip && mv cmdline-tools latest
yes | ~/Android/Sdk/cmdline-tools/latest/bin/sdkmanager --licenses
~/Android/Sdk/cmdline-tools/latest/bin/sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

---

## 2. O `.env` é obrigatório — e ele vira parte do APK

O Vite substitui `import.meta.env.*` **em tempo de build**. Sem `frontend/.env`,
o APK sai sem URL do Supabase e o app abre na tela de erro.

O `frontend/.env` **já existe nesta máquina**, preenchido com as credenciais de
produção. Em outra máquina, recrie a partir do `.env.example`:

```bash
VITE_SUPABASE_URL=https://lnkrplyghpukmovpzkea.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...           # pegue no painel do Supabase
VITE_API_BASE_URL=https://minitecnico-projeto-financas-pessoa.vercel.app
```

> `vercel env pull` **não** serve para isso: a CLI devolve `[SENSITIVE]` no lugar
> dos valores. Pegue a anon key no painel do Supabase (Settings → API).

> **No modo remoto (o atual), o `frontend/.env` não afeta o que roda no
> celular.** O app executa o bundle que a Vercel construiu, com as variáveis do
> painel dela. O `.env` local só volta a importar se você retornar ao modo
> empacotado.

### Por que `VITE_API_BASE_URL` só importa no APK

Na web, [`ai.js`](frontend/src/services/ai.js) chamava `/api/ai-chat` — caminho
relativo, mesma origem da Vercel. Dentro do WebView a origem passa a ser
`https://localhost`, onde esse caminho não existe. Por isso a variável aponta
para o domínio publicado. **Na web, deixe vazia** (o caminho relativo continua
sendo o certo).

> A `anon key` ir dentro do APK não é problema — ela é pública por design, e a
> segurança real está nas policies de RLS do Postgres. Vale o mesmo raciocínio
> do `CLAUDE.md`: nada de esconder chave no cliente.

---

## 3. Gerando o APK

```bash
cd frontend
npm run android:apk
```

Isso encadeia `vite build` → `cap sync android` → `gradlew assembleDebug`.
O arquivo sai em:

```
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

Scripts disponíveis:

| Script | O que faz |
|---|---|
| `npm run android:sync` | build web + copia o `dist/` para dentro do projeto Android |
| `npm run android:apk` | sync + gera o **APK de debug** (instalável direto no celular) |
| `npm run android:aab` | sync + gera o **AAB de release** (formato da Play Store) |
| `npm run android:open` | sync + abre o projeto no Android Studio (se instalado) |
| `npm run android:assets` | regenera ícones e splash a partir de `frontend/assets/` |

### Instalando no celular

```bash
# via cabo USB, com "Depuração USB" ligada nas opções de desenvolvedor
adb install -r frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

Ou copie o `.apk` para o celular e abra pelo gerenciador de arquivos (o Android
vai pedir para autorizar "instalar apps de fontes desconhecidas").

---

## 3b. Gerando o APK pelo Android Studio

O Android Studio já está instalado nesta máquina via snap
(`/snap/bin/android-studio`), e o `capacitor.config.json` aponta para ele em
`android.linuxAndroidStudioPath` — sem isso o Capacitor procuraria em
`/usr/local/android-studio`, que não existe aqui.

### O passo que não dá para pular

**O Android Studio não roda o Vite nem o Capacitor.** Ele só compila o projeto
Android. Se você editar o React e mandar buildar direto pelo Studio, o APK sai
com a versão antiga. Sempre antes:

```bash
cd frontend
npm run android:sync    # vite build + cap sync android
```

### Abrindo

```bash
cd frontend
npm run android:open    # faz o sync e abre o Studio já no projeto certo
```

Ou na mão: **Android Studio → Open →** selecione a pasta
`frontend/android`. Tem que ser essa pasta — apontar para a raiz do repositório
faz o Studio não reconhecer um projeto Gradle.

Na primeira abertura ele roda o "Gradle sync" e baixa dependências. Espere a
barra de progresso terminar antes de buildar.

### Gerando o APK

**Build → Build Bundle(s) / APK(s) → Build APK(s)**

Ao terminar aparece a notificação *"APK(s) generated successfully"* com um link
**locate** que abre a pasta. O arquivo é o mesmo do build por linha de comando:

```
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

O botão **Run ▶** é outra coisa: ele compila *e instala* num aparelho ou
emulador. Precisa de um device conectado com depuração USB, ou de um emulador
criado no Device Manager (o system image baixa mais ~1 GB).

### Detalhes que costumam travar

- **"Gradle JDK" / erro de toolchain.** O `~/.gradle/gradle.properties` fixa
  `org.gradle.java.home` no Temurin 21. Isso vale para **todos** os projetos
  Gradle desta máquina — se um dia você abrir um projeto antigo que precise de
  JDK 17, é aqui que vai dar conflito. Dá para sobrescrever por projeto em
  *File → Settings → Build, Execution, Deployment → Build Tools → Gradle →
  Gradle JDK*.
- **Mudou o `capacitor.config.json`?** Rode `npm run android:sync` e, no Studio,
  *File → Sync Project with Gradle Files*.
- **No modo remoto, mudança de React não pede APK novo.** Só faça esse
  processo quando mexer em ícone, splash, nome ou `server.url` (ver o topo
  deste arquivo).

---

## 4. Build de release (assinado)

O APK de debug usa uma chave de depuração automática e **não** pode ir para a
Play Store. Para release, gere um keystore — **uma vez só, e guarde bem**:

```bash
keytool -genkey -v -keystore ~/cofre-release.jks -keyalg RSA \
  -keysize 2048 -validity 10000 -alias cofre
```

> Perder esse arquivo (ou a senha) significa **nunca mais conseguir publicar
> atualização** do app com o mesmo `applicationId`. Faça backup fora do repo —
> o `.gitignore` bloqueia `*.jks`, `*.keystore` e `keystore.properties` de
> propósito.

Crie `frontend/android/keystore.properties` (não versionado):

```properties
storeFile=/home/suporte/cofre-release.jks
storePassword=SUA_SENHA
keyAlias=cofre
keyPassword=SUA_SENHA
```

E adicione o `signingConfig` em `frontend/android/app/build.gradle`, dentro do
bloco `android { }`:

```gradle
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

signingConfigs {
    release {
        storeFile file(keystoreProperties['storeFile'])
        storePassword keystoreProperties['storePassword']
        keyAlias keystoreProperties['keyAlias']
        keyPassword keystoreProperties['keyPassword']
    }
}

buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled false
    }
}
```

Depois: `npm run android:aab` gera o `.aab` em
`frontend/android/app/build/outputs/bundle/release/`.

---

## 5. Identidade do app

Definida em `frontend/capacitor.config.json`:

- `appId`: `com.cofre.app` — **imutável depois de publicar na Play Store.**
  Se quiser outro (ex.: `br.com.seudominio.cofre`), troque **antes** do primeiro
  release e rode `npx cap sync android`.
- `appName`: `Cofre` (vira o nome sob o ícone).
- `androidScheme: https` — faz o WebView servir de `https://localhost`, o que
  mantém `localStorage` (sessão do Supabase) e evita bloqueio de conteúdo misto.

Ícone e splash são gerados de `frontend/assets/icon.svg` e
`frontend/assets/splash.svg`. Editou algum? Rode `npm run android:assets`.

O `frontend/assets/icon.svg` é uma cópia do `public/icons/icon.svg` — se mudar o
visual, atualize os dois.

---

## 6. Diferenças de comportamento entre web e APK

| | Web (navegador) | APK — modo remoto (atual) | APK — modo empacotado |
|---|---|---|---|
| Origem | domínio da Vercel | domínio da Vercel | `https://localhost` |
| Service worker | ativo | **ativo** — é o que dá offline aqui | desligado (assets já são locais) |
| `/api/ai-chat` | mesma origem | mesma origem | cross-origin → precisa de `VITE_API_BASE_URL` + CORS |
| Atualizar front | deploy | **deploy** | gerar e instalar APK |
| Primeira abertura sem internet | — | falha | funciona |
| Botão "voltar" do Android | — | histórico do React Router | idem |

A lógica que decide isso está em [`main.jsx`](frontend/src/main.jsx): o service
worker só é pulado quando `isNativePlatform()` **e** a origem é `localhost` —
ou seja, apenas no modo empacotado.

O CORS em `api/ai-chat.js` tem uma allowlist fechada (`https://localhost`,
`capacitor://localhost`, `http://localhost`). No modo remoto ela fica ociosa (a
chamada é same-origin), mas continua ali para o caso de você voltar ao modo
empacotado. Não troque por `*`: o endpoint gasta créditos de IA, e o JWT do
Supabase não deve ser a única barreira.

---

## 7. Problemas comuns

**"Toolchain ... does not provide the required capabilities: [JAVA_COMPILER]"**
O Gradle achou um JRE, não um JDK. Confira `org.gradle.java.home` em
`~/.gradle/gradle.properties` e depois rode `cd frontend/android && ./gradlew --stop`
(o daemon antigo fica em memória com a config velha).

**App abre na tela de erro / tela branca**
Quase sempre `.env` faltando ou incompleto no momento do build. Verifique com:
```bash
grep -o "https://[a-z0-9]*\.supabase\.co" frontend/dist/assets/index-*.js
```
Se não retornar nada, o build saiu sem credenciais.

**Chat de IA falha só no APK**
`VITE_API_BASE_URL` vazia, ou o deploy da Vercel ainda sem o CORS novo. Publique
a `api/ai-chat.js` atualizada antes de testar.

**Inspecionar o WebView**
Com o celular conectado, abra `chrome://inspect` no Chrome do desktop — dá acesso
ao console e à aba Network de dentro do app.
