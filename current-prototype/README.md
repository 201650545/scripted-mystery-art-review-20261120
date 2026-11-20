# Five-Player Mystery Game Prototype

This source snapshot describes the current browser prototype and its player-facing controls. It is provided to support a visual-only waiting-room redesign review.

## Current UI and interactions

- A player enters the catalog, reviews a script, chooses AI or human hosting, and creates a room. Invited players use the same entry page and join only after manually submitting the room code.
- The waiting room supports role selection, seat assignment, readiness, and a dual-player desktop test view for owner and invited-player flows.
- The phone stage defaults to portrait immersive layout. It includes stage, role card, clues, summaries, public information, invite, music, and settings entries. Detailed content opens in secondary panels.
- The desktop host uses a landscape public stage. It has no portrait-seat mode. The desktop test navigation for computer, host, player, and dual-player views remains visible.
- The prototype supports the complete demonstration flow through introductions, initial questions, two clue and discussion rounds, summaries, secret voting, tie revotes, elimination, reveal, outcome, and ending.

## Scope limits

The current original five-player script content, real AI text service, and speech recognition are not connected. Keep placeholder story content clearly identified. The task is visual styling and stage lighting only. Preserve existing UI hooks and interactions.

## Source files

- `index.html` defines the desktop, host, player, and dual-player test surfaces.
- `style.css` defines the shared visual system and responsive layouts.
- `app.js` binds prototype interactions.
- `stage-views.js` builds the current stage views.
- `puppet-model.js` defines the current five-person cloth puppet models.