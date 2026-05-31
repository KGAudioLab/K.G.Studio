## Aide

Bienvenue dans **l’assistant musical K.G.Studio**, votre agent IA dédié à la composition, à l’arrangement et au travail de production directement dans le navigateur.

Pour commencer, vous pouvez soit utiliser le **LLM local intégré au navigateur** sans clé API, soit configurer un fournisseur LLM externe.

---

### Utiliser le LLM local (navigateur) sans clé API

K.G.Studio peut exécuter **Gemma 4 E4B** entièrement dans votre navigateur avec accélération WebGPU. Aucune requête API externe n’est envoyée, aucun coût supplémentaire n’est engagé, et vos données restent sur votre machine.

1. Dans **Réglages ⚙️ → Général → Fournisseur LLM**, sélectionnez **LLM local (navigateur)**.
2. Le modèle (~2,8 Go) se télécharge automatiquement lors de la première ouverture du chat, puis reste en cache local pour les lancements suivants.
3. Vous pouvez régler la **Longueur de contexte** (32k / 64k / 128k tokens) selon votre matériel.
4. Commencez à dialoguer.

**Configuration recommandée :** Chrome 113+ ou Edge 113+, contexte sécurisé (HTTPS ou localhost), et GPU avec au moins 8 Go de VRAM ou machine avec au moins 16 Go de mémoire unifiée.

> Remarque : la qualité du modèle local reste inférieure à celle des grands modèles commerciaux. Pour les tâches complexes, un fournisseur externe donnera généralement de meilleurs résultats.

---

### Configurer un fournisseur LLM externe

Allez dans **Réglages ⚙️ → Général → Fournisseur LLM**. Selon le fournisseur choisi, vous devrez renseigner la clé API appropriée et, si besoin, une URL de base personnalisée.

---

### Utiliser OpenAI

1. Récupérez une clé API OpenAI depuis [**OpenAI**](https://platform.openai.com/account/api-keys).
2. Dans **Réglages ⚙️ → Général → Fournisseur LLM**, choisissez **OpenAI**.
3. Saisissez votre clé dans **OpenAI → Clé**.
4. Sélectionnez le modèle voulu dans **OpenAI → Modèle**. Pour un bon compromis coût / performances, `gpt-5.4-mini` est recommandé.
5. Vous pouvez activer **Mode Flex** si vous acceptez une latence plus variable en échange d’un coût potentiellement réduit.

---

### Utiliser OpenRouter

OpenRouter donne accès à de nombreux modèles via une API unique, y compris certaines options gratuites.

1. Créez une clé API sur [**OpenRouter**](https://openrouter.ai/keys).
2. Dans **Réglages ⚙️ → Général → Fournisseur LLM**, choisissez **Serveur compatible OpenAI**.
3. Saisissez votre clé dans **Serveur compatible OpenAI → Clé**.
4. Consultez les modèles disponibles sur la [**page des modèles OpenRouter**](https://openrouter.ai/models).
5. Saisissez le nom du modèle dans **Serveur compatible OpenAI → Modèle**.
6. Saisissez `https://openrouter.ai/api/v1` dans **Serveur compatible OpenAI → URL de base**.

### Opérations DAW de base

Commandes du chat : `/clear`, `/welcome`, `/help`, `/hotkeys`

- Pistes
  - Ajouter, renommer et réordonner les pistes depuis le panneau d’infos de piste.
  - Changer d’instrument via le bouton instrument ; régler Solo, Mute et Volume.
  - Supprimer une piste depuis son menu de réglages.
  - **Enregistrement audio** : cliquez sur `Rec` dans la barre d’outils pour enregistrer directement dans une piste audio.

- Régions
  - Créer une région : avec l’outil pointeur, double-cliquez ; ou maintenez `Ctrl/Cmd` et cliquez. Avec l’outil crayon, un simple clic suffit.
  - Déplacer / redimensionner : faites glisser le corps de région pour déplacer, ou les bords pour redimensionner.
  - Ouvrir le Piano Roll via le petit crayon en haut à gauche de la région.

- Piano Roll
  - Outils : Sélection ou Crayon.
  - Créer des notes : double-clic ou `Ctrl/Cmd+clic` en mode sélection ; clic simple en mode crayon.
  - Sélectionner : clic, `Maj+clic` pour la multisélection, ou glisser pour un lasso.
  - Déplacer / redimensionner : faites glisser le corps ou les bords des notes.
  - **Vue partition** : bascule entre Piano Roll et notation sur portée depuis la barre d’outils.
  - **Voies d’automation** : éditez le pitch bend et les courbes MIDI CC sous la grille piano.
  - **Mode spectrogramme** : affichez le spectrogramme d’une région audio comme référence d’édition.
  - **Liste des événements** : inspectez et modifiez les notes, pitch bends et contrôleurs de la région MIDI active.

- Système de pistes globales
  - Quatre pistes permanentes en haut de la timeline : **Repère**, **Tempo**, **Armure** et **Accord**.
  - Elles pilotent le timing, les suggestions d’accords, l’affichage de la partition et certains résultats d’analyse.

- Analyse audio
  - **Détecter les accords** : ouvre l’analyse harmonique d’une région audio et alimente la piste globale des accords.
  - **Détecter le tempo** : analyse une région audio pour en extraire le BPM et peut réaligner le tempo du projet.

- Générateur musical K.G.One
  - Cliquez sur le bouton **✦** dans la barre d’outils.
  - **Morceau complet** : génération d’un titre complet à partir d’une description et, si besoin, de paroles.
  - **Clip** : génération de clips instrumentaux courts et de boucles MIDI.
  - **Séparation de stems (navigateur)** : séparation locale d’une région audio en stems, sans serveur.

- Snap et quantification
  - Réglez le snap depuis le menu `NO SNAP`.
  - Quantifiez avec `Qua. Pos.` et `Qua. Len.`.

- Lecture
  - Retour au début ; Lecture / Pause depuis la barre d’outils.
  - Placez la tête de lecture en cliquant sur les numéros de mesure.
  - Changez BPM, chiffrage de mesure et armure depuis la barre d’outils.

---

### Remarque

Par sécurité, lorsque K.G.Studio tourne hors d’un hôte local, les clés API ne sont pas conservées dans IndexedDB par défaut. Vous pouvez activer leur persistance dans les réglages, mais ce n’est pas recommandé sur un environnement partagé.

### Avertissement

K.G.Studio n’héberge aucun des modèles mentionnés et n’est affilié à aucun fournisseur de modèles. Toutes les données restent sur votre appareil ; vous êtes responsable des informations envoyées à des services tiers.
