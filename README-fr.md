[English](./README.md) | Français | [简体中文](./README-zh_cn.md) | [繁體中文](./README-zh_hk.md)

<div align="center">
  <img src="./public/logo.png" alt="K.G.Studio Logo" width="160" />
</div>

# K.G.Studio — Une DAW basée sur le navigateur avec assistant IA

<div align="center">
  <h3><a href="https://kgaudiolab.github.io/kgstudio"><b>◀ Commencer à utiliser K.G.Studio en ligne dans votre navigateur ▶</b></a></h3>
</div>

## Qu'est-ce que K.G.Studio ?

K.G.Studio est une DAW légère et moderne qui fonctionne entièrement dans le navigateur, avec **K.G.Studio Musician Assistant** en son cœur. Il propose une lecture réaliste des instruments via les samplers Tone.js, un éditeur piano roll, une gestion des pistes et des régions avec annulation/rétablissement complets, la persistance des projets dans OPFS (Origin Private File System), un panneau de configuration personnalisable, et un assistant IA intégré avec exécution d'outils.

**K.G.Studio Musician Assistant** vous aide à composer des mélodies, construire des progressions d’accords et éditer des pistes et des notes MIDI en langage naturel. Connectez des API LLM externes, ou utilisez **Gemma 4 E4B** comme solution de repli intégrée, entièrement exécutée dans votre navigateur avec l’accélération WebGPU, sans clé API.

<div align="center">
  <img src="./docs/KGStudio-Demo-20261010.gif" alt="Animation de démonstration de K.G.Studio" width="640" />
</div>

### Outils musicaux IA

Les deux outils fonctionnent entièrement dans votre navigateur avec **l’accélération WebGPU** sur le matériel compatible, en traitant les données MIDI et audio localement.

- **Humanisation** — Générez des courbes de contrôleurs MIDI expressives avec [AIRE](https://huggingface.co/KGAudioLab/instrument-aire-models) pour les cordes, les cuivres et les bois, selon le rôle musical et l’ambiance. Façonnez la modulation, le souffle, le volume ou l’expression tout en préservant le placement temporel et la vélocité des notes.
- **Extraction de stems** — Séparez l’audio en voix et instruments, ou en voix, batterie, basse et autres instruments. Écoutez les stems extraits et importez-les directement dans votre arrangement pour poursuivre l’édition.

## Dernières mises à jour

- **2026.10.18** : ajout de la prise en charge locale de MCP pour les agents IA externes :
  - **Outils pour les agents externes** — connectez Codex, Claude Code, OpenCode ou Pi pour éditer la musique avec des outils qui se mettent à jour automatiquement lorsque le mode d’agent actif change.
  - **Gestion des projets** — consultez les informations du projet actuel et créez, listez, enregistrez ou ouvrez des projets directement depuis votre agent connecté.
  - **Configuration et contrôle en local** — utilisez `npm run dev:mcp` ou `npm run preview:mcp` et gardez K.G.Studio ouvert dans votre navigateur. Les requêtes sont désactivées par défaut ; activez-les dans **Paramètres → MCP**.

- **2026.10.11** : introduction des effets de piste (FX) pour façonner le son et mixer :
  - **Chaînes d’effets flexibles** — ajoutez un égaliseur (EQ), une réverbération, un compresseur et un limiteur aux pistes MIDI et audio, avec des paramètres réglables, le bypass des effets, la réorganisation par glisser-déposer et une prise en charge complète de l’annulation et du rétablissement.
  - **Visualisation en temps réel** — ajustez l’égaliseur avec une courbe de réponse interactive et un spectre en direct, et suivez les niveaux et la réduction de gain du compresseur et du limiteur pendant la lecture.
  - **Réglages FX réutilisables** — enregistrez et chargez des préréglages de chaînes d’effets, copiez des effets individuels entre les pistes et incluez les FX lors de la duplication de pistes. Les réglages des effets sont enregistrés avec votre projet.

<div align="center">
  <img src="./docs/KGStudio-FX-Demo-20261011.gif" alt="Animation de démonstration des effets de piste de K.G.Studio" width="420" />
</div>

- **2026.10.10** : ajout de l’humanisation expressive MIDI et de nouvelles capacités d’édition pour l’agent IA :
  - **Humanisation AIRE** — générez des courbes d’expression MIDI éditables pour les cordes, les cuivres et les bois, entièrement dans votre navigateur avec l’accélération WebGPU. Choisissez le rôle musical, l’ambiance et le contrôleur cible (CC1, CC2, CC7 ou CC11), avec un conditionnement optionnel par la vélocité et une simplification des courbes. Le placement temporel et la vélocité des notes sont préservés.
  - **Mode avancé de l’agent** — utilisez des outils musicaux JSON structurés et un placement temporel précis en ticks pour éditer vos arrangements en détail. L’assistant peut modifier ou supprimer l’automation du volume, du panoramique, du pitch bend et des CC MIDI, avec des mises à jour groupées de points en une seule opération annulable. Les listes structurées de pistes et d’instruments enrichissent le contexte du projet.

- **2026.07.18** : introduction de nouveaux workflows puissants pour l'arrangement et l'édition MIDI :
  - **Transposition flexible et adaptée à la tonalité** — appliquez des réglages de transposition indépendants au niveau de la piste ou de la région, transposez le contenu sur une plage allant jusqu'à trois octaves et, si vous le souhaitez, suivez les changements d'armure. Le contenu de la piste d'accords peut désormais être transposé automatiquement lorsque la tonalité du projet ou une région d'armure change, afin de préserver l'intention harmonique de l'arrangement.
  - **Mode Référence MIDI** — superposez une seconde région MIDI dans le piano roll sous forme de référence en lecture seule, alignée sur la timeline, afin de coordonner plus facilement mélodies, harmonies, voicings et relations rythmiques lors de l'édition d'une autre partie.
  - **Améliorations diverses** — visibilité et navigation de la tête de lecture affinées, pistes globales fixes, duplication de piste configurable, orthographe enharmonique adaptée à la tonalité dans les partitions et superposition des menus de l'éditeur améliorée.

- **2026.07.12** : développement des workflows de création, d'édition et de lecture MIDI :
  - **Arpégiateur intelligent** — apprenez un motif à partir de notes d'exemple et générez des variations guidées par des accords ou du MIDI, tout en conservant les hauteurs chromatiques d'origine et avec annulation atomique.
  - **Édition et export MIDI accélérés** — sélectionnez les notes par rang de hauteur sur des plages configurables, puis exportez une région, une piste complète ou l'ensemble du projet au format MIDI standard.
  - **Instruments personnalisés persistants** — créez des instruments réutilisables à partir d'échantillons WAV ou MP3 avec assignation par hauteur, préécoute, tessiture configurable, instruments de secours intégrés et prise en charge transparente de la lecture et de l'export MIDI.
  - **Un éditeur plus ciblé** — le piano roll s'ancre désormais sous la timeline dans une disposition redimensionnable, tandis que les commandes de piste restent accessibles lors du défilement horizontal.
  - **Lecture et notation plus fiables** — le mode solo prévaut désormais sur le mute, les pistes audio peuvent être réactivées pendant la lecture et les silences en clé de fa s'affichent à la bonne position sur la portée.

- **2026.06.05** : développement majeur du **K.G.Studio Musician Assistant**, transformé en agent IA de niveau projet complet :
  - **Outils de gestion de pistes** — l'agent peut désormais lister, créer, mettre à jour et supprimer des pistes, et parcourir tous les instruments disponibles, sans nécessiter de sélectionner une région au préalable.
  - **Outils de pistes globales** — accès complet en lecture/écriture/suppression aux quatre pistes globales : **Chord Progression**, **Tempo (BPM)**, **Key Signature** et **Markers**. L'agent peut restructurer l'ensemble du squelette harmonique et rythmique d'un arrangement en une seule conversation.
  - **Confirmation des outils** — les opérations d'écriture affichent une étape de confirmation dans le chat avant d'être exécutées, vous donnant la possibilité de vérifier avant que quoi que ce soit ne change.
  - **Liste de tâches de l'agent** — l'assistant maintient désormais une liste de tâches en ligne, affichée sous forme de cartes de snapshot en direct directement dans le chat, rendant les plans en plusieurs étapes transparents et traçables.
  - **Historique des conversations** — les sessions de chat sont persistées par projet et peuvent être reprises après rechargement de la page.
  - **Compactage automatique du contexte** — les longues conversations sont résumées automatiquement lorsque la limite de contexte approche, permettant aux sessions de continuer sans intervention manuelle.
  - **Mode agent efficace** — un prompt simplifié et un ensemble d'outils réduit pour les modèles de langage plus petits ou locaux, activé automatiquement lors de l'utilisation du Local Browser LLM.

Pour consulter l'historique complet des versions, voir les [**Notes de version**](./docs/RELEASE_NOTES.md).

## État du projet

**K.G.Studio est un projet expérimental encore en phase de développement précoce.** Nous explorons les possibilités d'intégrer des agents IA et des LLM dans les flux de production musicale, en construisant essentiellement une expérience de type « Cursor ou Claude Code pour DAW ».

Ce projet étudie comment la collaboration entre l'IA et l'humain peut enrichir la création musicale, depuis les suggestions harmoniques intelligentes jusqu'aux tâches d'édition automatisées. En tant que plateforme expérimentale, attendez-vous à des changements fréquents, des fonctionnalités en évolution et une instabilité occasionnelle au fur et à mesure que nous repoussons les limites de la production musicale assistée par l'IA.

## Vidéos de démonstration

<div align="center">
  <table>
    <tr>
      <td align="center">
        <a href="https://youtu.be/FXgihfAH2vc" target="_blank">
          <img src="./public/demo/cover-FXgihfAH2vc.png" alt="Short Demo" width="400"/>
        </a>
        <br><b>Démo courte (DAW uniquement)</b>
      </td>
      <td align="center">
        <a href="https://www.youtube.com/watch?v=W25buhoeYN0" target="_blank">
          <img src="./public/demo/cover-vKbWAQRt0r0.png" alt="Full Demo" width="400"/>
        </a>
        <br><b>Démo complète (DAW uniquement)</b>
      </td>
    </tr>
  </table>
</div>

## Démarrage rapide

### Configurer K.G.Studio Musician Assistant

Il existe deux façons d'utiliser K.G.Studio Musician Assistant : **Local LLM (Browser)**, qui s'exécute entièrement dans votre navigateur sans clé API, sans coût et sans que les données quittent votre appareil, ou un **fournisseur LLM externe** pour obtenir des réponses de meilleure qualité.

#### Option A : Local LLM (Browser) — Aucune clé API requise ✦

K.G.Studio peut exécuter **Gemma 4 E4B** directement dans votre navigateur grâce à l'accélération WebGPU. Aucun appel API n'est effectué, aucun coût n'est engagé et vos données ne quittent jamais votre machine.

  - Cliquez ici pour commencer à utiliser l'application en ligne : [K.G.Studio (kgaudiolab.github.io/kgstudio)](https://kgaudiolab.github.io/kgstudio)
  - Dans **Settings ⚙️ → Music Assistant → LLM Provider**, sélectionnez **Local LLM (Browser)** (option par défaut).
  - Le modèle (~2.8 GB) se télécharge automatiquement la première fois que vous ouvrez le chat et est mis en cache dans l'OPFS (Origin Private File System) de votre navigateur pour des lancements ultérieurs quasi instantanés.
  - Vous pouvez également configurer la **Context Length** (32k / 64k / 128k tokens) ; des valeurs plus élevées nécessitent davantage de VRAM.
  - Commencez à discuter ! Pas de clé, pas de compte, pas de trafic réseau après le téléchargement initial du modèle.

**Conditions pour Local LLM :** un navigateur compatible WebGPU (Chrome 113+ ou Edge 113+) exécuté dans un contexte sécurisé (HTTPS ou localhost). Matériel recommandé : un GPU avec au moins 8 GB de VRAM, ou un système avec au moins 16 GB de mémoire unifiée.

> **Remarque :** la qualité du modèle local ne peut pas être comparée à celle des modèles commerciaux de type GPT ou Claude. Pour des tâches d'édition musicale complexes, un fournisseur externe produira en général de meilleurs résultats.

#### Option B : Fournisseur LLM externe (meilleure qualité)

  - Cliquez ici pour commencer à utiliser l'application en ligne : [K.G.Studio (kgaudiolab.github.io/kgstudio)](https://kgaudiolab.github.io/kgstudio)
  - [Obtenez une clé API OpenRouter](https://openrouter.ai/keys) (un compte OpenRouter est requis).
  - Dans **Settings ⚙️ → Music Assistant → LLM Provider**, sélectionnez **OpenAI Compatible**.
  - Dans **Fournisseur LLM (compatible OpenAI) → Key**, collez votre clé. (Remarque : hors localhost, votre clé n'est pas persistée par défaut pour des raisons de sécurité ; vous pouvez activer « Persist API Keys on Non-Localhost » dans les paramètres pour la persister, mais cela peut augmenter le risque XSS.)
  - Dans **Fournisseur LLM (compatible OpenAI) → Model**, saisissez l’identifiant du modèle de votre choix depuis la [page des modèles OpenRouter](https://openrouter.ai/models). Vérifiez ses tarifs et sa politique de traitement des données avant utilisation ; K.G.Studio **n’est pas** affilié à OpenRouter ni à aucun fournisseur de modèles.
  - Dans **Fournisseur LLM (compatible OpenAI) → Base URL**, saisissez `https://openrouter.ai/api/v1`.

**Conseils :**
- Vous pouvez également utiliser l'API officielle d'OpenAI, d'autres services compatibles OpenAI, ou un serveur LLM auto-hébergé (par exemple Ollama, vLLM). Notez que la qualité des modèles varie : tous les modèles ne sont pas aussi performants pour les tâches d'édition musicale. Nous recommandons GPT 6.1 Sol pour son équilibre entre qualité et coût.
- Si vous disposez d'un abonnement actif chez OpenAI ou chez un autre fournisseur LLM, vous pouvez utiliser [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) pour exécuter un serveur proxy local qui achemine les requêtes via votre abonnement existant, sans nécessiter de clé API séparée.

### Opérations DAW de base
  - Double-cliquez (ou maintenez Ctrl/Cmd et cliquez) sur une piste pour créer une région.
  - Faites glisser les bords de la région pour la redimensionner ; faites glisser son corps pour la déplacer.
  - Cliquez sur le petit crayon en haut à gauche d'une région pour ouvrir le piano roll.
  - Dans le piano roll, double-cliquez (ou Ctrl/Cmd+clic) pour créer une note.
  - Cliquez pour sélectionner ; Shift+clic pour la multi-sélection ; glissez pour faire une sélection rectangulaire.
  - Faites glisser les bords de la note pour la redimensionner ; faites glisser le corps de la note pour déplacer les notes sélectionnées.
  - Utilisez Snapping dans la barre d'outils du piano roll (en haut à droite) pour quantifier sur la grille.

### Utiliser K.G.Studio Musician Assistant
  - Sélectionnez la région musicale sur laquelle vous souhaitez que l'assistant travaille, saisissez votre prompt dans le chat ; appuyez sur Enter pour envoyer, Shift+Enter pour insérer une nouvelle ligne.
  - L'agent traitera automatiquement votre demande et invoquera des outils pour effectuer des modifications limitées à la région sélectionnée. Une tâche peut nécessiter un ou plusieurs tours pour être accomplie.
  - Notez que l'IA peut se tromper ; vous devez donc toujours vérifier le résultat et l'ajuster si nécessaire. Vous pouvez également utiliser annulation/rétablissement pour revenir sur les changements.
  - Cliquez sur le bouton « + » ou utilisez la commande `/clear` pour effacer l'historique du chat.

### Plus de détails

Vous trouverez le guide utilisateur détaillé [ici](./docs/USER_GUIDE.md).

### Points forts
- **K.G.Studio Musician Assistant** : discutez avec l'agent IA alimenté par un LLM ; il exécute automatiquement des outils pour effectuer des modifications musicales dans la région sélectionnée.
- **LLM intégré au navigateur — aucune clé API requise** : exécutez **Gemma 4 E4B** entièrement dans votre navigateur via WebGPU (LiteRT-LM). Aucun appel API, aucun coût, aucune donnée quittant votre appareil. Le modèle est téléchargé une fois et mis en cache localement.
- **Séparation de stems intégrée au navigateur — aucun serveur requis** : séparez n'importe quelle région audio en stems avec **UVR-MDX-NET-Inst_HQ_3** (2 stems : Vocals / Instrumental) ou **Demucs htdemucs_4s** (4 stems : Vocals / Drums / Bass / Others), tous deux entièrement exécutés dans le navigateur via ONNX Runtime WebGPU.
- **Détection d'accords audio** : ouvrez le piano roll sur une région audio et lancez **Detect Chords** pour analyser automatiquement l'enregistrement et remplir la Chord Track globale avec un pipeline FFT sans dépendance, avec sensibilité, stabilité et détection des accords de septième configurables.
- **Détection de tempo avec alignement automatique des temps** : lancez **Detect Tempo** depuis la barre d'outils du piano roll pour analyser le BPM d'une région audio et, si vous le souhaitez, réaligner la Tempo Track du projet.
- **Système de pistes globales** : quatre pistes globales persistantes — **Marker**, **Tempo**, **Key Signature** et **Chord** — fournissent une structure à l'échelle du projet à laquelle toutes les fonctions (timing de lecture, détection d'accords, notation musicale) se réfèrent.
- **Plusieurs fournisseurs LLM** : OpenAI, Claude / Gemini (via OpenRouter), services compatibles OpenAI (Ollama, vLLM, etc.), ou Local Browser LLM intégré — sans clé requise.
- **Édition de pistes et de régions** : ajouter/réordonner des pistes, créer/déplacer/redimensionner des régions, multi-sélection avec lasso, déplacement/redimensionnement de groupe, fusion et scission de régions, avec annulation/rétablissement complet.
- **Piano roll** : notes, pitch bend et lanes d'automation MIDI CC ; vue de notation musicale (sheet music) via VexFlow ; superposition de spectrogramme pour la référence audio-vers-MIDI.
- **Vrais instruments** : sampler basé sur Tone.js avec soundfonts FluidR3 de haute qualité. Enregistrez directement l'audio depuis votre microphone vers une piste audio.
- **Assistant d'accords intelligent** : suggestions d'accords en temps réel basées sur l'harmonie fonctionnelle (T/S/D), avec aperçu visuel et création d'accord en un clic.
- **Persistance avec confidentialité** : projets et configuration enregistrés entièrement dans votre navigateur (OPFS / IndexedDB). Aucun serveur propriétaire.

Pour une vue technique plus approfondie, voir [overview.md](./docs/technical/overview.md).

## Premiers pas

### Ou cloner et exécuter localement :
```bash
# Assurez-vous d'avoir Node.js 24.22.0 LTS (npm 11.19.1) installé
# Cloner le dépôt
git clone https://github.com/KGAudioLab/KGStudio {your-local-path}
cd {your-local-path}

# Installer les dépendances
npm ci

# Lancer le serveur de développement
npm run dev
```

### Serveur MCP local (Codex, Claude Code, OpenCode et Pi)

K.G.Studio peut mettre ses outils musicaux à la disposition de clients MCP externes via **la révision MCP `2025-11-25` sur Streamable HTTP**.

**Les deux conditions suivantes doivent être remplies :**

1. Exécutez le serveur K.G.Studio avec MCP activé **sur votre ordinateur local**.
2. Ouvrez la page locale de K.G.Studio **dans votre navigateur** et gardez cet onglet ouvert. Les outils utilisent le projet actif, la sélection et l'historique d'annulation de cet onglet. Démarrer uniquement le serveur ne suffit pas.

Après avoir installé les dépendances, choisissez l'une des options suivantes :

```bash
# Développement : Vite avec rechargement à chaud + MCP
npm run dev:mcp

# Ou servir les fichiers compilés + MCP (compiler d'abord)
npm run build
npm run preview:mcp
```

| Commande | Page à ouvrir dans votre navigateur | Point d'accès MCP |
| --- | --- | --- |
| `dev:mcp` | `http://127.0.0.1:5173/kgstudio/` | `http://127.0.0.1:5173/mcp` |
| `preview:mcp` | `http://127.0.0.1:4173/kgstudio/` | `http://127.0.0.1:4173/mcp` |

Ces commandes écoutent uniquement sur l'interface de bouclage et échouent si leur port est occupé. Le terminal affiche l'URL de la page et le point d'accès MCP. **Aucun jeton, variable d'environnement ou en-tête d'authentification n'est nécessaire.** Configurez votre client MCP avec le point d'accès HTTP local ; les requêtes restent limitées à l'interface de bouclage et aux origines locales autorisées.

Pour les clients utilisant une configuration MCP en JSON, une entrée de serveur HTTP ressemble généralement à ceci (adaptez la structure englobante à votre client) :

```json
{
  "mcpServers": {
    "kgstudio": {
      "type": "http",
      "url": "http://127.0.0.1:5173/mcp"
    }
  }
}
```

Pour Codex, ajoutez ceci à votre fichier local `config.toml` :

```toml
[mcp_servers.kgstudio]
url = "http://127.0.0.1:5173/mcp"
```

Utilisez le port `4173` pour `preview:mcp`. Pour OpenCode V2, configurez un serveur `remote` avec cette URL et conservez le protocole `legacy` (`oauth: false` désactive la découverte OAuth inutile). Claude Code et Pi peuvent utiliser l'URL HTTP sans authentification ; consultez la documentation de configuration propre à chaque client.

**Outils et changement de mode :**

- MCP suit le **mode d'agent effectif** de l'application (Regular, Advanced ou Efficient). Le fournisseur Local LLM (Browser) impose le mode Efficient, comme pour l'assistant interne.
- Changer de mode met à jour le catalogue d'outils et envoie une notification MCP de changement de liste, sans redémarrer le serveur. Si votre client ne se met pas à jour automatiquement, reconnectez-le.
- Les outils dont les interfaces diffèrent de manière incompatible selon le mode portent un nom qualifié, comme `regular_add_notes`, `advanced_add_notes` et `efficient_add_notes`. Les outils Advanced utilisent **960 ticks par noire** ; les outils Regular/Efficient expriment le temps en noires. Les outils communs conservent leur nom d'origine.
- `update_todo_list` est réservé à l'assistant interne de K.G.Studio et n'est jamais accessible via MCP.
- La section MCP des paramètres n'apparaît que lorsque cet onglet est connecté au service MCP local ; elle est masquée sur un hébergement statique et lorsque le service est indisponible. **Les requêtes MCP sont désactivées par défaut.** Dans **Paramètres → MCP → Autoriser les requêtes MCP**, choisissez **Activé** pour autoriser les outils externes. Ce choix est enregistré dans ce navigateur. Les requêtes désactivées renvoient une erreur demandant au client d'inviter l'utilisateur à activer MCP ; une fenêtre d'information indique également à l'utilisateur d'ouvrir Paramètres → MCP. Les requêtes répétées partagent le même message tant qu'il est ouvert. Les requêtes autorisées s'exécutent sans confirmation individuelle, indépendamment des réglages de l'assistant interne. Désactiver MCP invalide les appels en attente.
- Les modifications musicales utilisent le système de commandes existant et offrent le même comportement d'annulation que les outils correspondants dans l'application.
- Un seul **onglet de navigateur** contrôle MCP à la fois. Les autres onglets affichent un message d'état ; fermez l'onglet qui contrôle MCP, puis rechargez l'onglet souhaité pour le connecter. Fermer l'onglet rend les outils indisponibles. La mise en veille d'un onglet par le navigateur peut retarder l'exécution.
- Les appels expirent après deux minutes. Si une requête expire ou si la connexion est interrompue, vérifiez le projet avant de réessayer une modification : une opération déjà en cours peut avoir abouti. Les appels en attente sont refusés si le mode ou le projet change avant leur exécution.

**Les outils de projet réservés à MCP** sont disponibles dans tous les modes d'agent :

| Outil | Comportement |
| --- | --- |
| `get_current_project_info` | Lire le nom du projet actif, l'état de sa sauvegarde, ses paramètres musicaux, le nombre de pistes et le mode effectif. |
| `create_project` | Nécessite `name`. Créer et activer un projet non enregistré, en abandonnant les modifications actuelles non enregistrées. Les noms invalides, le nom réservé `Untitled Project` et les noms déjà présents dans le stockage renvoient une erreur. |
| `list_projects` | Lister les projets enregistrés et non supprimés avec leurs dates de création et de modification. |
| `save_project` | Enregistrer sous le nom actuel exact, sans renommage ni suffixe automatique. Enregistrer `Untitled Project` ou écraser un autre projet renvoie une erreur. |
| `open_project` | Nécessite `name`. Activer un projet enregistré par son nom exact, en abandonnant les modifications actuelles non enregistrées. Un projet absent, supprimé ou impossible à charger renvoie une erreur. |

Les projets sont stockés dans l'OPFS du navigateur qui contrôle MCP. Des profils, noms d'hôte ou ports différents (y compris développement et prévisualisation) peuvent avoir des bibliothèques de projets distinctes. Créer ou ouvrir un projet réinitialise l'éditeur et l'historique d'annulation ; les modifications abandonnées ne peuvent pas être annulées. Arrêtez l'enregistrement avant de changer de projet. La création n'enregistre pas automatiquement le projet : appelez `save_project` pour le conserver.

Le client externe doit fonctionner sur le même ordinateur ou avoir accès à son interface de bouclage ; les agents hébergés dans le cloud ne peuvent pas accéder directement à ce point d'accès localhost. Aucune clé API LLM de K.G.Studio n'est nécessaire pour exécuter les outils MCP : l'agent externe utilise son propre modèle.

**L'hébergement statique reste pris en charge.** Les commandes habituelles `dev`, `build` et `preview` n'activent pas les points d'accès MCP. `npm run build` produit toujours un dossier `dist/` autonome pour GitHub Pages et les autres hébergeurs statiques, et le workflow de déploiement GitHub Pages reste inchangé. La page publique ne se connecte pas à localhost. Seules les commandes locales avec MCP activé fournissent ce serveur facultatif.

## Configuration

K.G.Studio charge ses valeurs par défaut depuis `./public/config.json` (avec une valeur de secours interne) et persiste les modifications utilisateur dans le navigateur via `ConfigManager` + IndexedDB. IndexedDB est la base de données locale propre à votre navigateur, stockée sur votre appareil ; elle ne quitte pas votre machine et est effacée si vous supprimez les données de ce site. Modifiez les paramètres via le panneau Settings intégré à l'application.

- **General**
  - Base URL des soundfonts (CDN pour les échantillons d'instruments)
- **Assistant musical**
  - Fournisseur LLM : OpenAI, ou compatible OpenAI
  - Clés API et modèles pour le fournisseur sélectionné
  - Persist API Keys on Non-Localhost : permet de persister les clés API dans des environnements non localhost (option de sécurité volontaire, non recommandée pour les environnements partagés ou de production)
  - Base URL compatible OpenAI (pour les passerelles auto-hébergées)
- **Behavior**
  - Ouverture du chat par défaut au démarrage
- **Templates**
  - Instructions personnalisées utilisées par l'assistant IA

### Connectivité et confidentialité

- K.G.Studio fonctionne entièrement côté client. Aucun serveur propriétaire n'est nécessaire pour faire fonctionner l'application.
- Les projets et fichiers audio sont stockés dans l'OPFS (Origin Private File System) de votre navigateur ; la configuration est stockée dans IndexedDB. Toutes les données restent sur votre appareil.
- L'accès réseau est utilisé uniquement pour :
  - télécharger les échantillons d'instruments depuis le CDN de soundfonts configuré
  - communiquer avec le fournisseur LLM que vous avez choisi (par exemple OpenAI ou des services compatibles OpenAI)
  - lorsque vous l'activez explicitement avec `dev:mcp` ou `preview:mcp`, communiquer avec le pont MCP local pour permettre aux agents externes d'utiliser les outils musicaux du navigateur
- En dehors de ces cas, l'application fonctionne localement. Si vous bloquez les points d'accès aux échantillons ou au LLM, l'application se charge toujours ; les fonctions de lecture et d'IA concernées nécessitent que ces points d'accès soient disponibles.
- Pour des raisons de sécurité, lorsque l'application est exécutée depuis un hôte non local, nous ne persistons pas votre clé API dans IndexedDB par défaut (afin de réduire le risque XSS). Vous devrez la saisir à chaque démarrage de K.G.Studio. Pour activer la persistance sur des hôtes non locaux, activez « Persist API Keys on Non-Localhost » dans les paramètres (non recommandé pour les environnements partagés ou de production).

## Utiliser l'application

Vous trouverez le guide utilisateur détaillé [ici](./docs/USER_GUIDE.md).

- Pistes
  - Ajoutez, renommez et réordonnez les pistes depuis le panneau d'informations des pistes.
  - Changez d'instrument avec le bouton d'instrument (icône de piano) ; ajustez Solo (S), Mute (M) et Volume.
  - Supprimez une piste depuis le menu des paramètres de la piste (bouton à droite de l'instrument).

- Régions
  - Créer une région : avec l'outil Pointer, double-cliquez ; ou maintenez Ctrl/Cmd et cliquez. Avec l'outil Pencil, cliquez une seule fois.
  - Déplacer/redimensionner : faites glisser le corps pour déplacer ; faites glisser les bords pour redimensionner.
  - Ouvrez le Piano Roll via le petit crayon en haut à gauche d'une région.

- Piano Roll (notes MIDI)
  - Outils : Select vs Pencil.
  - Créer des notes : double-cliquez ou Ctrl/Cmd+clic (Select) ; clic simple (Pencil).
  - Sélectionner des notes : clic ; Shift+clic pour la multi-sélection ; glisser pour la sélection rectangulaire.
  - Déplacer/redimensionner : faites glisser le corps de la note pour déplacer les notes sélectionnées ; faites glisser les bords pour redimensionner.
  - **Vue en notation musicale** : basculez entre les vues Piano Roll et Staff Notation depuis la barre d'outils du piano roll. Prend en charge la sélection automatique de la clé, l'affichage de l'armure, le groupement des crochets, les liaisons et la quantification configurable. Activez **Track Scope** pour afficher toutes les régions de la piste comme une partition continue.
  - **Lanes d'automation** : dessinez et modifiez des courbes de pitch bend et de MIDI CC (Modulation, Breath, Volume, Expression, Sustain) dans la lane éditable sous la grille piano.
  - **Mode spectrogramme** : affichez le spectrogramme d'une région audio dans le piano roll comme couche de référence pendant l'édition des notes MIDI.
  - Fermez le piano roll avec X ou ESC.

- Intelligent Chord Assistant (ajouté le 2025-12-15)
  - Activez le guide d'accords depuis la barre d'outils du piano roll : sélectionnez la fonction T (Tonic), S (Subdominant) ou D (Dominant).
  - Survolez n'importe quelle touche pour voir les suggestions d'accords adaptées au contexte, mises en évidence en rouge, en accord avec l'armure et le mode sélectionnés.
  - Appuyez sur Tab pour faire défiler différents renversements d'accords pour la même fonction harmonique.
  - Double-cliquez (ou Ctrl/Cmd+clic) sur un accord surligné pour créer toutes les notes d'un coup.
  - La longueur de l'accord correspond automatiquement à la dernière longueur de note modifiée pour conserver un rythme cohérent.

- Snapping et quantification
  - Définissez le snapping depuis le menu NO SNAP (en haut à droite).
  - Quantifiez le timing avec Qua. Pos. (début) et Qua. Len. (longueur).

- Lecture et tête de lecture
  - Retour au début ; lecture/pause depuis la barre d'outils.
  - Placez la tête de lecture en cliquant sur les numéros de mesure dans la grille principale ; dans Piano Roll, cliquez sur l'en-tête de la timeline (respecte le snapping).
  - Modifiez le BPM, la signature rythmique et la tonalité via les indicateurs de la barre d'outils.

## Raccourcis clavier

- Principal
  - Lecture/Pause : Space
  - Annuler / Rétablir : Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z
  - Copier / Couper / Coller : Ctrl/Cmd+C / Ctrl/Cmd+X / Ctrl/Cmd+V
  - Sauvegarder : Ctrl/Cmd+S
  - Maintenir pour créer une région : Ctrl/Cmd
- Piano Roll
  - Outils : Select (Q), Pencil (W)
  - Maintenir pour créer une note : Ctrl/Cmd
  - Snap : 1(None), 2(1/4), 3(1/8), 4(1/16)
  - Quantification de position : 5(1/4), 6(1/8), 7(1/16)
  - Quantification de longueur : 8(1/4), 9(1/8), 0(1/16)

## Assistant IA

### Utiliser K.G.Studio Musician Assistant

- Assurez-vous d'avoir suivi la section précédente pour configurer le fournisseur LLM.
- Vous trouverez la zone de chat de K.G.Studio Musician Assistant à droite. Si vous ne la voyez pas, cliquez sur le bouton Chat 🗨️ dans la barre d'outils.
- Sélectionnez la région sur laquelle vous souhaitez que l'assistant travaille, saisissez votre prompt dans le chat ; appuyez sur Enter pour envoyer, Shift+Enter pour insérer une nouvelle ligne.
- L'agent traitera automatiquement votre demande et invoquera des outils pour effectuer des modifications limitées à la région sélectionnée. Une tâche peut nécessiter un ou plusieurs tours pour être accomplie.
- Notez que l'IA peut se tromper ; vous devez donc toujours vérifier le résultat et l'ajuster si nécessaire. Vous pouvez aussi utiliser annulation/rétablissement pour revenir en arrière.
- Cliquez sur le bouton « + » ou sur la commande `/clear` pour effacer l'historique du chat.

### Configurer votre fournisseur LLM

Allez dans **Settings ⚙️ → Music Assistant → LLM Provider**. Selon le fournisseur choisi, vous devrez fournir la clé API appropriée et, le cas échéant, une base URL personnalisée (pour les services non officiels compatibles OpenAI comme Ollama, OpenRouter, etc.).

Remarque : en raison des limitations CORS chez certains fournisseurs, Google Gemini et Anthropic Claude ne sont actuellement pris en charge que via OpenRouter.

### Utiliser les modèles OpenAI

1. Obtenez une clé API OpenAI auprès de [**OpenAI**](https://platform.openai.com/account/api-keys). Vous devrez peut-être créer un compte et ajouter un moyen de paiement pour générer une clé API.
2. Ouvrez **Réglages ⚙️ → Assistant musical**, puis cliquez sur le préréglage **OpenAI** sous **Fournisseur LLM (compatible OpenAI)**. Il renseigne la connexion et active le mode **Compatible OpenAI**.
3. Saisissez votre clé API dans **Fournisseur LLM (compatible OpenAI) → Clé**.
4. Le préréglage définit le modèle `gpt-6.1-sol`. Vous pouvez saisir un autre modèle accessible à votre compte.

Les préréglages comprennent OpenAI, Claude (via OpenRouter), OpenRouter, Ollama, llama.cpp et CLIProxyAPI. Un clic remplace la clé, l’URL de base et le modèle, puis active le mode Compatible OpenAI. Pour les abonnements ChatGPT ou Claude pris en charge, [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) propose une connexion locale compatible utilisant les accès disponibles avec votre abonnement. Tous les préréglages effacent la clé. Saisissez la clé de votre fournisseur ou serveur si une authentification est requise.

### Utiliser OpenRouter

OpenRouter est une plateforme qui fournit un accès unifié à un large éventail de modèles de langage provenant de divers fournisseurs. Cela facilite l'expérimentation et la recherche du modèle le mieux adapté à vos besoins.

1. Obtenez une clé API auprès de [**OpenRouter**](https://openrouter.ai/keys). L'inscription est requise ; pour les modèles payants, un moyen de paiement peut également être nécessaire.
2. Ouvrez **Réglages ⚙️ → Assistant musical** et cliquez sur le préréglage **OpenRouter** sous **Fournisseur LLM (compatible OpenAI)**.
3. Saisissez votre clé API dans **Fournisseur LLM (compatible OpenAI) → Key**.
4. Parcourez les modèles disponibles sur la [**page des modèles OpenRouter**](https://openrouter.ai/models) et comparez leurs tarifs et leurs capacités.
   **Remarque :** chaque fournisseur de modèle peut avoir des politiques différentes en matière de conservation des données et de confidentialité. Veuillez les consulter avant utilisation.
5. Saisissez le nom du modèle choisi dans **Fournisseur LLM (compatible OpenAI) → Model**.
6. Saisissez l'URL de base `https://openrouter.ai/api/v1` dans **Fournisseur LLM (compatible OpenAI) → Base URL**.

Vous pouvez également consulter la [page des modèles OpenRouter](https://openrouter.ai/models) pour découvrir les modèles gratuits actuellement disponibles. Leur disponibilité évolue ; K.G.Studio ne recommande pas de modèles gratuits spécifiques pour l’édition musicale.

### À propos de l'agent et des fournisseurs LLM

Pour des raisons de sécurité, lorsque vous utilisez K.G.Studio depuis un hôte non local, les clés API ne sont pas persistées dans IndexedDB par défaut ; vous devrez donc saisir votre clé API à chaque démarrage de K.G.Studio. Pour activer la persistance sur des hôtes non locaux, activez « Persist API Keys on Non-Localhost » dans les paramètres (non recommandé pour les environnements partagés ou de production).

K.G.Studio ne fournit ni n'héberge aucun des modèles listés ci-dessus et n'est affilié à aucun fournisseur de modèles. Toutes les données sont stockées localement sur votre appareil ; K.G.Studio ne collecte ni ne transmet vos données. Vous êtes seul responsable de toute donnée que vous fournissez à des fournisseurs de modèles tiers.

## Outils musicaux IA

Le panneau **Outils musicaux IA** extrait des stems directement dans votre navigateur. Cliquez sur le bouton **✦ (baguette magique)** de la barre d’outils pour l’ouvrir. Le panneau propose les onglets **Extraction de stems** et **Humaniser**. L’ouverture de ce panneau ferme le chat AI Assistant.

### Stem Separation

Séparez une région audio existante en stems individuels (par exemple voix, instruments, batterie).

Deux modèles ONNX s'exécutent entièrement dans votre navigateur, sans appels API, sans coût, et sans que vos données quittent votre appareil. Les modèles sont téléchargés une fois puis mis en cache localement.

- **Vocal and Instrument (Medium Accuracy)** (`UVR-MDX-NET-Inst_HQ_3`, ~64 MB) — séparation en deux stems (Vocals / Instrumental). Alimenté par [UVR-MDX-NET](https://github.com/nomadkaraoke/python-audio-separator).
- **Vocal, Drums, Bass, and Others** (`htdemucs_4s`, ~172 MB) — séparation en quatre stems (Vocals / Drums / Bass / Others). Alimenté par [Demucs](https://github.com/facebookresearch/demucs).

Ouvrez le panneau **Outils musicaux IA** (bouton ✦ dans la barre d'outils), sélectionnez un modèle, cliquez une fois sur **Download Selected Model**, puis sur **Separate Stems** : tout s'exécute localement dans votre navigateur.

**Conditions requises :** un navigateur compatible WebGPU (Chrome 113+ ou Edge 113+) dans un contexte sécurisé (HTTPS ou localhost). L'accélération WebGPU est utilisée lorsque disponible ; sinon, le système revient au CPU (ce qui peut réduire la réactivité de la page pendant le traitement). Matériel recommandé : un GPU avec au moins 8 GB de VRAM, ou un système avec au moins 16 GB de mémoire unifiée.

#### Utilisation

- **Sélectionnez une région audio** sur la timeline avant d'ouvrir cet onglet. La région sélectionnée et le nom de sa piste sont affichés en haut de l'onglet **Extraction de stems**. Seules les régions audio sont prises en charge ; les régions MIDI ne peuvent pas être séparées.
- Cliquez sur **Separate Stems**. Si la région sélectionnée a un clip start offset ou a été découpée, l'audio est automatiquement tronqué pour correspondre à la plage de la région avant traitement.
- Une fois terminé, chaque stem apparaît comme lecteur de prévisualisation étiqueté avec une poignée de glisser. Vous pouvez prévisualiser chaque stem individuellement avant l'import.
- **Pour importer les stems :**
  - Faites glisser chaque lecteur de stem individuellement sur une **audio track** pour le placer où vous le souhaitez.
  - Ou cliquez sur **Import All Stems to Timeline** pour créer automatiquement une nouvelle piste audio par stem, positionnée juste sous la piste source et alignée sur le même point de départ que la région d'origine. Il s'agit d'une seule opération annulable.

### Humaniser

En vue forme d’onde ou spectrogramme, **… → Extraction de stems…** ouvre cet onglet.

Sélectionnez une région MIDI sur la timeline, puis choisissez **… → Humaniser…** pour ouvrir **Outils musicaux IA → Humaniser**. Tous les réglages sont visibles dans l’onglet. AIRE génère une expression modifiable pour **CC1, CC2, CC7 ou CC11**, sans changer le timing ni la vélocité des notes. Une boucle active limite le traitement à son intersection avec la région. Les réglages sont conservés pendant la session ; quitter l’onglet annule le traitement. À la fin, la courbe du contrôleur généré s’affiche dans le piano roll. L’onglet suit la sélection sur la timeline et affiche le fournisseur et l’état du cache du modèle, avec des boutons pour télécharger, retélécharger ou supprimer le modèle sélectionné.

## Fonctionnalités à venir

Les priorités peuvent évoluer.

### 1.0

- [X] Plus d'instruments
- [X] Tests automatisés (tests unitaires, tests d'intégration, etc.)
- [X] Assistant d'accords intelligent avec guidage harmonique fonctionnel (T/S/D)
- [X] Prise en charge des automations de contrôle de piste (par ex. sustain, volume, pan, etc.)
- [X] Prise en charge des événements de contrôle MIDI (par ex. CC, pitch bend, etc.)
- [X] Prise en charge des pistes audio WAV
- [X] Enregistrement
- [X] Event List
- [X] Ajout de la prise en charge des modèles open source d'OpenAI (`gpt-oss-20b` et `gpt-oss-120b`)
- [X] Notation musicale
- [X] Modèles IA intégrés au navigateur (LLM sur l'appareil via Gemma 4 E4B ; séparation de stems sur l'appareil via UVR-MDX-NET-Inst_HQ_3 et htdemucs_4s)
- [X] Système de pistes globales (Marker, Tempo, Key Signature, Chord)
- [X] Détection d'accords audio (FFT sans dépendance, remplit la Chord Track)
- [X] Détection de tempo avec alignement automatique des temps
- [X] Visualisation spectrogramme et Piano Roll hybrid mode

### Après la 1.0

- [X] Extension des outils de l'agent IA pour manipuler directement depuis le chat les régions, les pistes et les pistes globales (progressions d'accords, tempo, tonalité)
- [X] Effets de piste (FX) — égaliseur (EQ), réverbération, compresseur et limiteur avec ordre configurable dans la chaîne d’effets
- [ ] Vue Mixer avec panneau dédié, faders par piste, sends, bus de retour et canal master
- [ ] Audio time-stretch / warp pour étirer les régions audio et les adapter au tempo du projet
- [ ] Effets MIDI, comme arpégiateur, quantificateur de gamme et mémoire d'accords
- [ ] Sortie vers périphérique MIDI virtuel

## Aide recherchée

Nous cherchons des contributeurs pour rendre K.G.Studio encore meilleur ! Que vous soyez développeur, musicien ou designer, votre expertise peut faire une réelle différence.

### Comment vous pouvez aider

**🎵 Musiciens & producteurs**
- Tester la DAW avec de vrais workflows de production musicale
- Donner des retours sur la qualité et le réalisme des instruments
- Suggérer des fonctionnalités manquantes essentielles à la création musicale
- Aider à améliorer la compréhension musicale de l'assistant IA

**💻 Développeurs**
- Implémenter de nouvelles fonctionnalités de notre feuille de route
- Corriger des bugs et améliorer les performances
- Renforcer l'intégration Web Audio
- Travailler sur les capacités de l'assistant IA

**🎨 Designers UI/UX**
- Améliorer l'interface utilisateur et le workflow
- Concevoir un meilleur retour visuel pour l'édition musicale
- Créer des interactions plus intuitives

### Participer

Intéressé par une contribution ? Nous serions ravis d'avoir de vos nouvelles !

- **Écrivez-nous** : [kgstudio@duck.com](mailto:kgstudio@duck.com)
- **Consultez nos Issues** : parcourez les tickets ouverts avec les labels `help wanted` ou `good first issue`
- **Rejoignez les Discussions** : partagez vos idées et retours dans GitHub Discussions

Aucune contribution n'est trop petite : du signalement de bugs à la proposition de nouvelles fonctionnalités, chaque aide fait avancer le projet.

### Avertissement

K.G.Studio est un projet expérimental en phase de développement précoce. Nous explorons les possibilités d'intégrer des agents IA et des LLM dans les flux de production musicale, en construisant essentiellement une expérience de type « Cursor ou Claude Code pour DAW ».

Ce projet étudie comment la collaboration entre l'IA et l'humain peut enrichir la création musicale, depuis les suggestions harmoniques intelligentes jusqu'aux tâches d'édition automatisées. En tant que plateforme expérimentale, attendez-vous à des changements fréquents, des fonctionnalités en évolution et une instabilité occasionnelle à mesure que nous repoussons les limites de la production musicale assistée par l'IA.

K.G.Studio ne fournit ni n'héberge aucun modèle LLM et n'est affilié à aucun fournisseur de modèles. Toutes les données sont stockées localement sur votre appareil ; K.G.Studio ne collecte ni ne transmet vos données. Vous êtes seul responsable de toute donnée que vous fournissez à des fournisseurs de modèles tiers.

## Licence

Ce projet est distribué sous Apache License, Version 2.0, avec des conditions supplémentaires (voir `LICENSE`) :
- Aucune demande de brevet à partir de ce logiciel ou de ses ressources
- Attribution requise en cas d'utilisation dans des produits publics/commerciaux (« Powered by K.G.Studio »)

Les notices tierces (FluidR3_GM SoundFont, midi-js-soundfonts, VexFlow, Hopkins Media Services, prompt structure notes, Gemma 4 E4B, UVR-MDX-NET-Inst_HQ_3, MediaPipe, Meyda, web-audio-beat-detector, tonal, htdemucs_4s, onnxruntime-web, AIRE et demucs-web) sont incluses dans `LICENSE`.
