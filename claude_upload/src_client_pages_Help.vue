<template>
  <div class="max-w-3xl mx-auto px-4 py-8">
    <div
      class="prose prose-sm max-w-none
             prose-headings:text-base-content
             prose-p:text-base-content/80
             prose-li:text-base-content/80
             prose-strong:text-base-content
             prose-code:text-primary
             prose-table:text-base-content
             prose-a:text-primary"
      v-html="renderedHtml"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { marked } from 'marked';

const { locale } = useI18n();

// ─── Deutsch ──────────────────────────────────────────────────────────────
const markdown_de = `
# open SCOREBOARD – Benutzeranleitung

> *by sluiten-scoreboard.com, Schweiz*

---

## Übersicht

open SCOREBOARD ist eine webbasierte Anzeigetafel für Hallensport (Unihockey, Handball, Eishockey u.a.). Der Server läuft lokal oder auf einem Raspberry Pi; alle Geräte im selben Netz verbinden sich per Browser – kein App-Install nötig.

**Drei Ansichten:**

| URL | Zweck | Wer nutzt es |
|-----|-------|--------------|
| \`/\` | **Kickstart** – Spiel konfigurieren | Operator |
| \`/operator\` | **Operator** – Spielsteuerung | Operator |
| \`/display.html\` | **Anzeigetafel** – TV/Beamer | Zuschauer |

---

## 1. Anmeldung

Alle Seiten ausser der Anzeigetafel (\`/display.html\`) sind durch einen **PIN** geschützt – so kann niemand im selben WLAN den Operator übernehmen.

- Beim ersten Aufruf von \`/\`, \`/operator\` oder \`/settings\` erscheint eine PIN-Eingabe.
- Nach erfolgreicher Anmeldung bleibst du angemeldet, auch nach einem Neustart des Browsers (Token wird lokal gespeichert).
- **PIN ändern:** unter Einstellungen → Operator-PIN.
- **Abmelden:** 🚪-Symbol oben rechts in der Navigation.

> ⚠️ **Standard-PIN aktiv?** Falls in der Statusleiste ein Warnhinweis erscheint, läuft der Server noch mit dem Standard-PIN \`0000\`. Bitte zeitnah in den Einstellungen einen eigenen PIN setzen.

Die Anzeigetafel selbst benötigt **keine** Anmeldung – sie läuft typischerweise auf einem separaten Gerät (TV/Beamer) ohne Zugriff auf die Spielsteuerung.

---

## 2. Spielstart (Kickstart)

Vor jedem Spiel rufst du \`/\` (Startseite) auf.

### Teams
- **Heim-Team / Gast-Team:** Kürzel eingeben (max. 3 Zeichen, wird automatisch grossgeschrieben).
- **Teamfarbe:** Farbwähler rechts neben dem Textfeld anklicken. Die Farbe erscheint auf der Anzeigetafel als Teamfarbe.

### Sport-Vorlage
Wähle die passende Vorlage aus dem Dropdown. Nach der Auswahl siehst du eine Kurzübersicht mit Perioden, Pausen, Overtime und Straftypen.

> **Tipp:** Die Standard-Vorlage ist in der YAML-Datei mit \`isDefault: true\` markiert und wird beim Öffnen vorausgewählt.

### Spiel starten
Klicke auf **▶ Spiel starten**. Du wirst direkt zum Operator weitergeleitet. Die Uhr startet noch **nicht** – das machst du manuell im Operator.

---

## 3. Operator

Hier läuft die Spielsteuerung. Alle Änderungen werden per WebSocket in Echtzeit an die Anzeigetafel übertragen.

### 3.1 Spielzeit

| Schaltfläche | Funktion |
|---|---|
| **▶ Start** | Uhr starten |
| **⏸ Stop** | Uhr anhalten |
| **⏭ Nächste Phase** | Zur nächsten Periode / Pause / OT wechseln |
| **📢 Horn** | Schlusspfiff manuell auslösen |
| **🔄 Reset** | Spiel zurücksetzen (Bestätigung erforderlich) |

**Zeitkorrektur (nur bei gestoppter Uhr):** Die \`−\` und \`+\` Buttons erscheinen neben der Zeitanzeige. Du kannst die Zeit auch direkt anklicken und im Format \`MM:SS\` eingeben. Mit **Enter** bestätigen, mit **Escape** abbrechen.

### 3.2 Spielstand

Für Heim und Gast je einen **+1** (Tor) und **−1** (rückgängig) Button.

### 3.3 Timeout

Die Buttons zeigen den Teamnamen und die verbleibende Anzahl Timeouts (\`TO Heim (1)\`). Nach dem letzten Timeout wird der Button deaktiviert. Während eines laufenden Timeouts erscheint der Countdown gross.

### 3.4 Strafen

**Strafe erfassen:**
1. Team wählen (Heim oder Gast)
2. Spielernummer eingeben
3. Straftyp wählen (z.B. 2 Min, 5 Min, 10')
4. **➕ Strafe erfassen** klicken

**Begleitstrafe:** Bei Badge-Strafen (z.B. 10'-Spieldauerstrafe) erscheint eine Checkbox «Begleitet». Wenn aktiviert, können Begleitspieler und Begleitstrafenart angegeben werden.

**Zeitkorrektur einer laufenden Strafe** (nur bei gestoppter Uhr): Die angezeigte Zeit anklicken → Wert eingeben → Enter.

**Warteschlange:** Wenn beide Strafslots belegt sind, kommt die neue Strafe automatisch in die Queue.

### 3.5 Penalty / Shootout

Falls die Vorlage einen Shootout vorsieht, erscheint ein separater Abschnitt zur Tor-Erfassung.

---

## 4. Anzeigetafel (\`/display.html\`)

Für TV oder Beamer optimiert. Empfängt alle Daten automatisch – einfach öffnen und stehen lassen. Zeigt Spielstand, Spielzeit, Phase und aktive Strafen. **Keine Anmeldung erforderlich.**

---

## 5. Einstellungen (\`/settings\`)

- **Sprache:** 🇩🇪 Deutsch, 🇫🇷 Français, 🇮🇹 Italiano, 🇬🇧 English
- **Theme:** Über 20 Farbthemen (Dark, Nord, Cyberpunk u.v.m.)
- **Operator-PIN:** Aktuellen PIN eingeben, neuen PIN setzen und bestätigen. Nach dem Ändern werden alle aktiven Sitzungen abgemeldet – auch deine eigene.
- **Beendete Spiele:** Archiv aller abgeschlossenen Spiele mit Endstand und Zeitstempel. Einzelne Einträge können gelöscht werden.

---

## 6. Sport-Vorlagen anpassen

Vorlagen liegen als YAML-Dateien im Verzeichnis \`sports-templates/\`. Änderungen erfordern einen Server-Neustart.

\`\`\`yaml
slug: mein-sport          # eindeutiger Bezeichner
name: Mein Sport          # Anzeigename im Dropdown
isDefault: false          # true = wird vorausgewählt
countUp: true             # true = hochzählen, false = runterzählen

periods:
  count: 3
  durationMinutes: 20
  breakMinutes: 10

overtime:
  enabled: true
  periods: 1
  durationMinutes: 5
  suddenDeath: true

penalties:
  maxActiveSlots: 2
  queueEnabled: true
  types:
    - id: minor
      label: "2 Min"
      durationSeconds: 120
      displayMode: slot      # slot = läuft ab; badge = nur Anzeige
      clearableByGoal: true  # wird durch Gegentor aufgehoben
\`\`\`

---

## 7. Absturz & Wiederherstellung

Der Server speichert den Spielzustand alle 5 Sekunden in \`state.json\`. Bei einem Neustart wird ein unterbrochenes Spiel automatisch wiederhergestellt.

**Nach einem Absturz:**
1. Server neu starten (\`npm start\`)
2. Operator öffnen – Spielstand und Phase sind geladen
3. Spielzeit per Zeitkorrektur auf den korrekten Wert setzen
4. Uhr wieder starten

---

## 8. Empfohlenes Setup am Spieltag

1. Server starten (Laptop oder Raspberry Pi im lokalen Netz)
2. Operator öffnen: \`http://<IP>:3000/operator\` und mit PIN anmelden
3. Anzeigetafel auf TV/Beamer öffnen: \`http://<IP>:3000/display.html\`
4. Kickstart aufrufen, Teams und Vorlage eintragen, Spiel starten
5. Uhr starten wenn Schiedsrichter pfeift

---

*open SCOREBOARD ist Source-Available unter der Business Source License 1.1 – [github.com/rsauter/openscoreboard](https://github.com/rsauter/openscoreboard)*
`;

// ─── English ──────────────────────────────────────────────────────────────
const markdown_en = `
# open SCOREBOARD – User Guide

> *by sluiten-scoreboard.com, Switzerland*

---

## Overview

open SCOREBOARD is a web-based scoreboard for indoor sports (floorball, handball, ice hockey, etc.). The server runs locally or on a Raspberry Pi; all devices on the same network connect via browser – no app install required.

**Three views:**

| URL | Purpose | Used by |
|-----|---------|---------|
| \`/\` | **Kickstart** – configure the game | Operator |
| \`/operator\` | **Operator** – game control | Operator |
| \`/display.html\` | **Display** – TV/projector | Spectators |

---

## 1. Sign-In

Every page except the display (\`/display.html\`) is protected by a **PIN** – this prevents anyone on the same Wi-Fi from hijacking the Operator.

- The first time you open \`/\`, \`/operator\`, or \`/settings\`, you'll see a PIN prompt.
- Once signed in, you stay signed in even after restarting the browser (the token is stored locally).
- **Change PIN:** under Settings → Operator PIN.
- **Sign out:** 🚪 icon in the top-right of the navigation.

> ⚠️ **Default PIN active?** If a warning appears in the status bar, the server is still running with the default PIN \`0000\`. Please set your own PIN in Settings soon.

The display itself requires **no** sign-in – it typically runs on a separate device (TV/projector) with no access to game control.

---

## 2. Game Start (Kickstart)

Before every game, open \`/\` (home page).

### Teams
- **Home team / Away team:** enter the abbreviation (max. 3 characters, automatically capitalised).
- **Team colour:** click the colour picker next to the text field. The colour appears on the display as the team colour.

### Sports Template
Select the appropriate template from the dropdown. After selecting, you'll see a quick overview of periods, breaks, overtime, and penalty types.

> **Tip:** The default template is marked with \`isDefault: true\` in its YAML file and is pre-selected on load.

### Start Game
Click **▶ Start Game**. You'll be redirected straight to the Operator. The clock does **not** start automatically – you do that manually in the Operator.

---

## 3. Operator

This is where game control happens. All changes are broadcast in real time to the display via WebSocket.

### 3.1 Game Clock

| Button | Function |
|---|---|
| **▶ Start** | Start the clock |
| **⏸ Stop** | Stop the clock |
| **⏭ Next Phase** | Move to the next period / break / OT |
| **📢 Horn** | Trigger the horn manually |
| **🔄 Reset** | Reset the game (confirmation required) |

**Time correction (only while clock is stopped):** \`−\` and \`+\` buttons appear next to the clock. You can also click the time directly and enter a value in \`MM:SS\` format. Press **Enter** to confirm, **Escape** to cancel.

### 3.2 Score

A **+1** (goal) and **−1** (undo) button for each of Home and Away.

### 3.3 Timeout

Buttons show the team name and remaining timeouts (\`TO Home (1)\`). The button is disabled after the last timeout. While a timeout is running, the countdown is shown prominently.

### 3.4 Penalties

**Adding a penalty:**
1. Select team (Home or Away)
2. Enter the player number
3. Select penalty type (e.g. 2 min, 5 min, 10')
4. Click **➕ Add Penalty**

**Companion penalty:** For badge penalties (e.g. a 10-minute misconduct), a "Companion" checkbox appears. When checked, you can specify a companion player and companion penalty type.

**Correcting a running penalty's time** (only while clock is stopped): click the displayed time → enter a value → Enter.

**Queue:** If both penalty slots are occupied, the new penalty is automatically placed in the queue.

### 3.5 Penalty Shootout

If the template includes a shootout, a separate section appears for recording shootout goals.

---

## 4. Display (\`/display.html\`)

Optimised for TV or projector. Receives all data automatically – just open it and leave it running. Shows score, game clock, phase, and active penalties. **No sign-in required.**

---

## 5. Settings (\`/settings\`)

- **Language:** 🇩🇪 Deutsch, 🇫🇷 Français, 🇮🇹 Italiano, 🇬🇧 English
- **Theme:** Over 20 colour themes (Dark, Nord, Cyberpunk, and more)
- **Operator PIN:** Enter your current PIN, set and confirm a new one. Changing it signs out all active sessions – including your own.
- **Finished games:** Archive of all completed games with final score and timestamp. Individual entries can be deleted.

---

## 6. Customising Sports Templates

Templates are YAML files in the \`sports-templates/\` directory. Changes require a server restart.

\`\`\`yaml
slug: my-sport             # unique identifier
name: My Sport             # display name in the dropdown
isDefault: false           # true = pre-selected
countUp: true               # true = count up, false = count down

periods:
  count: 3
  durationMinutes: 20
  breakMinutes: 10

overtime:
  enabled: true
  periods: 1
  durationMinutes: 5
  suddenDeath: true

penalties:
  maxActiveSlots: 2
  queueEnabled: true
  types:
    - id: minor
      label: "2 Min"
      durationSeconds: 120
      displayMode: slot      # slot = counts down; badge = display only
      clearableByGoal: true  # cleared by a goal against
\`\`\`

---

## 7. Crash & Recovery

The server saves the game state to \`state.json\` every 5 seconds. On restart, an interrupted game is automatically restored.

**After a crash:**
1. Restart the server (\`npm start\`)
2. Open the Operator – score and phase are loaded
3. Set the correct game time using the time correction
4. Start the clock again

---

## 8. Recommended Match-Day Setup

1. Start the server (laptop or Raspberry Pi on the local network)
2. Open the Operator: \`http://<IP>:3000/operator\` and sign in with the PIN
3. Open the display on TV/projector: \`http://<IP>:3000/display.html\`
4. Open Kickstart, enter teams and template, start the game
5. Start the clock when the referee blows the whistle

---

*open SCOREBOARD is source-available under the Business Source License 1.1 – [github.com/rsauter/openscoreboard](https://github.com/rsauter/openscoreboard)*
`;

// ─── Français ─────────────────────────────────────────────────────────────
const markdown_fr = `
# open SCOREBOARD – Guide d'utilisation

> *by sluiten-scoreboard.com, Suisse*

---

## Aperçu

open SCOREBOARD est un tableau d'affichage sportif basé sur le web pour les sports en salle (unihockey, handball, hockey sur glace, etc.). Le serveur fonctionne en local ou sur un Raspberry Pi ; tous les appareils du même réseau se connectent via le navigateur – aucune installation d'application nécessaire.

**Trois vues :**

| URL | But | Utilisé par |
|-----|-----|-------------|
| \`/\` | **Kickstart** – configurer le match | Opérateur |
| \`/operator\` | **Opérateur** – contrôle du match | Opérateur |
| \`/display.html\` | **Affichage** – TV/vidéoprojecteur | Spectateurs |

---

## 1. Connexion

Toutes les pages sauf l'affichage (\`/display.html\`) sont protégées par un **code PIN** – cela empêche quiconque sur le même Wi-Fi de prendre le contrôle de l'Opérateur.

- À la première ouverture de \`/\`, \`/operator\` ou \`/settings\`, une saisie du PIN s'affiche.
- Une fois connecté, tu restes connecté même après un redémarrage du navigateur (le jeton est stocké localement).
- **Changer le PIN :** dans Paramètres → PIN Opérateur.
- **Se déconnecter :** icône 🚪 en haut à droite de la navigation.

> ⚠️ **PIN par défaut actif ?** Si un avertissement apparaît dans la barre de statut, le serveur fonctionne encore avec le PIN par défaut \`0000\`. Merci de définir ton propre PIN dans les Paramètres prochainement.

L'affichage lui-même ne nécessite **aucune** connexion – il fonctionne généralement sur un appareil séparé (TV/vidéoprojecteur) sans accès au contrôle du match.

---

## 2. Démarrage du match (Kickstart)

Avant chaque match, ouvre \`/\` (page d'accueil).

### Équipes
- **Équipe à domicile / à l'extérieur :** saisir l'abréviation (max. 3 caractères, mise en majuscules automatiquement).
- **Couleur de l'équipe :** cliquer sur le sélecteur de couleur à droite du champ de texte. La couleur apparaît sur l'affichage comme couleur de l'équipe.

### Modèle sportif
Sélectionne le modèle approprié dans le menu déroulant. Après la sélection, tu verras un aperçu rapide des périodes, pauses, prolongations et types de pénalités.

> **Astuce :** le modèle par défaut est marqué \`isDefault: true\` dans son fichier YAML et est présélectionné à l'ouverture.

### Démarrer le match
Clique sur **▶ Démarrer le match**. Tu seras directement redirigé vers l'Opérateur. L'horloge ne démarre **pas** automatiquement – tu le fais manuellement dans l'Opérateur.

---

## 3. Opérateur

C'est ici que se déroule le contrôle du match. Tous les changements sont transmis en temps réel à l'affichage via WebSocket.

### 3.1 Temps de jeu

| Bouton | Fonction |
|---|---|
| **▶ Start** | Démarrer l'horloge |
| **⏸ Stop** | Arrêter l'horloge |
| **⏭ Phase suivante** | Passer à la prochaine période / pause / prolongation |
| **📢 Sirène** | Déclencher la sirène manuellement |
| **🔄 Reset** | Réinitialiser le match (confirmation requise) |

**Correction du temps (uniquement quand l'horloge est arrêtée) :** les boutons \`−\` et \`+\` apparaissent à côté de l'affichage du temps. Tu peux aussi cliquer directement sur le temps et saisir une valeur au format \`MM:SS\`. Valider avec **Entrée**, annuler avec **Échap**.

### 3.2 Score

Un bouton **+1** (but) et **−1** (annuler) pour chaque équipe, domicile et extérieur.

### 3.3 Temps mort

Les boutons affichent le nom de l'équipe et le nombre de temps morts restants (\`TM Domicile (1)\`). Le bouton est désactivé après le dernier temps mort. Pendant un temps mort en cours, le décompte est affiché en grand.

### 3.4 Pénalités

**Ajouter une pénalité :**
1. Choisir l'équipe (domicile ou extérieur)
2. Saisir le numéro du joueur
3. Choisir le type de pénalité (p. ex. 2 min, 5 min, 10')
4. Cliquer sur **➕ Ajouter une pénalité**

**Pénalité accompagnante :** pour les pénalités de type badge (p. ex. une pénalité de match de 10 minutes), une case « Accompagnée » apparaît. Si activée, tu peux indiquer un joueur accompagnant et le type de pénalité accompagnante.

**Corriger le temps d'une pénalité en cours** (uniquement quand l'horloge est arrêtée) : cliquer sur le temps affiché → saisir une valeur → Entrée.

**File d'attente :** si les deux emplacements de pénalité sont occupés, la nouvelle pénalité est automatiquement placée en file d'attente.

### 3.5 Penalty / Shootout

Si le modèle prévoit un shootout, une section séparée apparaît pour enregistrer les buts du shootout.

---

## 4. Affichage (\`/display.html\`)

Optimisé pour TV ou vidéoprojecteur. Reçoit toutes les données automatiquement – il suffit de l'ouvrir et de le laisser tourner. Affiche le score, le temps de jeu, la phase et les pénalités actives. **Aucune connexion requise.**

---

## 5. Paramètres (\`/settings\`)

- **Langue :** 🇩🇪 Deutsch, 🇫🇷 Français, 🇮🇹 Italiano, 🇬🇧 English
- **Thème :** plus de 20 thèmes de couleurs (Dark, Nord, Cyberpunk, et plus)
- **PIN Opérateur :** saisir le PIN actuel, définir et confirmer un nouveau PIN. Le changement déconnecte toutes les sessions actives – y compris la tienne.
- **Matchs terminés :** archive de tous les matchs terminés avec le score final et l'horodatage. Les entrées individuelles peuvent être supprimées.

---

## 6. Personnaliser les modèles sportifs

Les modèles sont des fichiers YAML dans le répertoire \`sports-templates/\`. Les modifications nécessitent un redémarrage du serveur.

\`\`\`yaml
slug: mon-sport            # identifiant unique
name: Mon Sport            # nom affiché dans le menu déroulant
isDefault: false            # true = présélectionné
countUp: true                # true = compte croissant, false = compte décroissant

periods:
  count: 3
  durationMinutes: 20
  breakMinutes: 10

overtime:
  enabled: true
  periods: 1
  durationMinutes: 5
  suddenDeath: true

penalties:
  maxActiveSlots: 2
  queueEnabled: true
  types:
    - id: minor
      label: "2 Min"
      durationSeconds: 120
      displayMode: slot      # slot = décompte ; badge = affichage seulement
      clearableByGoal: true  # annulée par un but adverse
\`\`\`

---

## 7. Plantage et récupération

Le serveur enregistre l'état du match toutes les 5 secondes dans \`state.json\`. Au redémarrage, un match interrompu est automatiquement restauré.

**Après un plantage :**
1. Redémarrer le serveur (\`npm start\`)
2. Ouvrir l'Opérateur – le score et la phase sont chargés
3. Corriger le temps de jeu via la correction du temps
4. Redémarrer l'horloge

---

## 8. Configuration recommandée le jour du match

1. Démarrer le serveur (ordinateur portable ou Raspberry Pi sur le réseau local)
2. Ouvrir l'Opérateur : \`http://<IP>:3000/operator\` et se connecter avec le PIN
3. Ouvrir l'affichage sur TV/vidéoprojecteur : \`http://<IP>:3000/display.html\`
4. Ouvrir Kickstart, saisir les équipes et le modèle, démarrer le match
5. Démarrer l'horloge quand l'arbitre siffle

---

*open SCOREBOARD est disponible en source ouverte sous la Business Source License 1.1 – [github.com/rsauter/openscoreboard](https://github.com/rsauter/openscoreboard)*
`;

// ─── Italiano ─────────────────────────────────────────────────────────────
const markdown_it = `
# open SCOREBOARD – Guida per l'utente

> *by sluiten-scoreboard.com, Svizzera*

---

## Panoramica

open SCOREBOARD è un tabellone segnapunti basato sul web per sport indoor (unihockey, pallamano, hockey su ghiaccio, ecc.). Il server funziona in locale o su un Raspberry Pi; tutti i dispositivi sulla stessa rete si collegano tramite browser – nessuna installazione di app necessaria.

**Tre vista:**

| URL | Scopo | Usato da |
|-----|-------|----------|
| \`/\` | **Kickstart** – configurare la partita | Operatore |
| \`/operator\` | **Operatore** – gestione della partita | Operatore |
| \`/display.html\` | **Tabellone** – TV/proiettore | Spettatori |

---

## 1. Accesso

Tutte le pagine eccetto il tabellone (\`/display.html\`) sono protette da un **PIN** – questo impedisce a chiunque sulla stessa rete Wi-Fi di impossessarsi dell'Operatore.

- Al primo accesso a \`/\`, \`/operator\` o \`/settings\` appare la richiesta del PIN.
- Una volta effettuato l'accesso, resti collegato anche dopo un riavvio del browser (il token viene salvato localmente).
- **Cambiare il PIN:** in Impostazioni → PIN Operatore.
- **Disconnettersi:** icona 🚪 in alto a destra nella navigazione.

> ⚠️ **PIN predefinito attivo?** Se nella barra di stato appare un avviso, il server è ancora in esecuzione con il PIN predefinito \`0000\`. Imposta presto un PIN personale nelle Impostazioni.

Il tabellone stesso **non** richiede alcun accesso – di norma funziona su un dispositivo separato (TV/proiettore) senza accesso alla gestione della partita.

---

## 2. Avvio partita (Kickstart)

Prima di ogni partita, apri \`/\` (pagina iniziale).

### Squadre
- **Squadra di casa / in trasferta:** inserisci la sigla (max. 3 caratteri, automaticamente in maiuscolo).
- **Colore squadra:** clicca sul selettore di colore a destra del campo di testo. Il colore appare sul tabellone come colore della squadra.

### Modello sportivo
Seleziona il modello appropriato dal menu a tendina. Dopo la selezione vedrai una panoramica rapida di periodi, pause, supplementari e tipi di penalità.

> **Suggerimento:** il modello predefinito è contrassegnato con \`isDefault: true\` nel file YAML ed è preselezionato all'apertura.

### Avviare la partita
Clicca su **▶ Avvia partita**. Verrai reindirizzato direttamente all'Operatore. L'orologio **non** parte automaticamente – lo fai manualmente nell'Operatore.

---

## 3. Operatore

Qui avviene la gestione della partita. Tutte le modifiche vengono trasmesse in tempo reale al tabellone via WebSocket.

### 3.1 Tempo di gioco

| Pulsante | Funzione |
|---|---|
| **▶ Start** | Avvia l'orologio |
| **⏸ Stop** | Ferma l'orologio |
| **⏭ Fase successiva** | Passa al periodo / pausa / supplementare successivo |
| **📢 Sirena** | Aziona la sirena manualmente |
| **🔄 Reset** | Reimposta la partita (richiede conferma) |

**Correzione del tempo (solo quando l'orologio è fermo):** i pulsanti \`−\` e \`+\` appaiono accanto al display del tempo. Puoi anche cliccare direttamente sul tempo e inserire un valore nel formato \`MM:SS\`. Confermare con **Invio**, annullare con **Esc**.

### 3.2 Punteggio

Un pulsante **+1** (gol) e **−1** (annulla) per ciascuna squadra, casa e trasferta.

### 3.3 Time-out

I pulsanti mostrano il nome della squadra e il numero di time-out rimanenti (\`TO Casa (1)\`). Il pulsante si disattiva dopo l'ultimo time-out. Durante un time-out in corso, il conto alla rovescia viene mostrato in grande.

### 3.4 Penalità

**Aggiungere una penalità:**
1. Scegli la squadra (casa o trasferta)
2. Inserisci il numero del giocatore
3. Scegli il tipo di penalità (es. 2 min, 5 min, 10')
4. Clicca su **➕ Aggiungi penalità**

**Penalità accompagnata:** per le penalità di tipo badge (es. una penalità di 10 minuti), appare una casella «Accompagnata». Se attivata, puoi indicare un giocatore accompagnante e il tipo di penalità accompagnante.

**Correggere il tempo di una penalità in corso** (solo quando l'orologio è fermo): clicca sul tempo visualizzato → inserisci un valore → Invio.

**Coda d'attesa:** se entrambi gli slot di penalità sono occupati, la nuova penalità viene automaticamente inserita in coda.

### 3.5 Rigori / Shootout

Se il modello prevede uno shootout, appare una sezione separata per registrare i gol dello shootout.

---

## 4. Tabellone (\`/display.html\`)

Ottimizzato per TV o proiettore. Riceve tutti i dati automaticamente – basta aprirlo e lasciarlo aperto. Mostra punteggio, tempo di gioco, fase e penalità attive. **Nessun accesso richiesto.**

---

## 5. Impostazioni (\`/settings\`)

- **Lingua:** 🇩🇪 Deutsch, 🇫🇷 Français, 🇮🇹 Italiano, 🇬🇧 English
- **Tema:** oltre 20 temi di colore (Dark, Nord, Cyberpunk e altri)
- **PIN Operatore:** inserisci il PIN attuale, imposta e confermi un nuovo PIN. La modifica disconnette tutte le sessioni attive – inclusa la tua.
- **Partite terminate:** archivio di tutte le partite concluse con risultato finale e data/ora. Le singole voci possono essere eliminate.

---

## 6. Personalizzare i modelli sportivi

I modelli sono file YAML nella cartella \`sports-templates/\`. Le modifiche richiedono un riavvio del server.

\`\`\`yaml
slug: mio-sport             # identificatore univoco
name: Il mio sport          # nome visualizzato nel menu a tendina
isDefault: false             # true = preselezionato
countUp: true                 # true = conteggio crescente, false = conteggio decrescente

periods:
  count: 3
  durationMinutes: 20
  breakMinutes: 10

overtime:
  enabled: true
  periods: 1
  durationMinutes: 5
  suddenDeath: true

penalties:
  maxActiveSlots: 2
  queueEnabled: true
  types:
    - id: minor
      label: "2 Min"
      durationSeconds: 120
      displayMode: slot      # slot = conto alla rovescia; badge = solo visualizzazione
      clearableByGoal: true  # annullata da un gol subito
\`\`\`

---

## 7. Crash e ripristino

Il server salva lo stato della partita in \`state.json\` ogni 5 secondi. Al riavvio, una partita interrotta viene ripristinata automaticamente.

**Dopo un crash:**
1. Riavvia il server (\`npm start\`)
2. Apri l'Operatore – punteggio e fase sono caricati
3. Imposta il tempo di gioco corretto tramite la correzione del tempo
4. Riavvia l'orologio

---

## 8. Configurazione consigliata il giorno della partita

1. Avvia il server (laptop o Raspberry Pi sulla rete locale)
2. Apri l'Operatore: \`http://<IP>:3000/operator\` e accedi con il PIN
3. Apri il tabellone su TV/proiettore: \`http://<IP>:3000/display.html\`
4. Apri Kickstart, inserisci squadre e modello, avvia la partita
5. Avvia l'orologio quando l'arbitro fischia

---

*open SCOREBOARD è source-available sotto la Business Source License 1.1 – [github.com/rsauter/openscoreboard](https://github.com/rsauter/openscoreboard)*
`;

const markdownByLocale: Record<string, string> = {
  de: markdown_de,
  en: markdown_en,
  fr: markdown_fr,
  it: markdown_it,
};

const renderedHtml = computed(() => {
  const md = markdownByLocale[locale.value] ?? markdown_en;
  return marked(md) as string;
});
</script>