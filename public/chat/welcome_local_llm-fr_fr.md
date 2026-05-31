## Mode LLM local

Bienvenue dans **l’assistant musical K.G.Studio** en mode LLM local.

- Aucune API externe n’est nécessaire. Tout s’exécute directement dans votre navigateur, sans coût API supplémentaire.
- Ce mode utilise **Gemma 4 E4B** via **LiteRT-LM** avec accélération **WebGPU**.
- Configuration matérielle recommandée : GPU avec au moins **8 Go de VRAM** ou système avec au moins **16 Go de mémoire unifiée**.
- Les performances restent plus limitées que celles des grands modèles hébergés dans le cloud, surtout pour les tâches longues, complexes ou très itératives.

### Flux de travail recommandé
- Gardez des demandes courtes et ciblées.
- Faites progresser le modèle étape par étape vers le résultat final.
- Travaillez sur de petites régions musicales plutôt que sur des arrangements de morceau complet.
- Préférez des consignes d’arrangement simples lorsque c’est possible.
- Ouvrez une nouvelle conversation pour chaque tâche autonome.

Exemple :
- Pour de meilleurs résultats, découpez les demandes complexes en plusieurs étapes.
- Si vous voulez que le modèle écrive une progression d’accords à partir de la musique actuelle, commencez par : `Please read the current music.`
- Une fois cette étape terminée, poursuivez avec : `Please write a chord progression based on it.`
- Ce flux incrémental est généralement plus fiable en mode LLM local.
- Gardez la région MIDI que vous souhaitez modifier sélectionnée pendant tout le flux de travail.
- Il n’est pas nécessaire de changer de sélection vers une autre région uniquement pour `read_music`, car `read_music` peut lire la musique sur l’ensemble des pistes.

### Utiliser plutôt un LLM externe
- Si vous souhaitez utiliser un modèle plus grand dans le cloud ou auto-hébergé, ouvrez **Réglages -> Général -> Fournisseur LLM** et quittez **LLM local (navigateur)**.
- Pour un modèle cloud, vous pouvez utiliser **OpenAI**, ou **Serveur compatible OpenAI** avec un fournisseur comme OpenRouter.
- Pour un modèle auto-hébergé, choisissez **Serveur compatible OpenAI** puis renseignez l’**URL de base** et le **Modèle** de votre serveur.
- Après changement de fournisseur, démarrez une nouvelle conversation pour repartir proprement avec le nouveau modèle.
