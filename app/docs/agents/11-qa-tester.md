# Agent 11 — qa-tester

**Phase:** 7 — Deploy & polish (final gate)
**Model routing:** `sonnet`
**Depends on:** everything
**Unblocks:** v1.0 release

---

## Objective

Play the system like a player would. Find the rough edges. Verify the Definition of Done in `PLAN.md §9`. Sign off on v1.0 or kick a bug list back to the relevant agent.

## Inputs

- A fully provisioned Pi with the latest install.
- Access to the phone + TV + ethernet LAN.
- All docs under `docs/`.

## Outputs

- [ ] `docs/QA-CHECKLIST.md` — the living test plan, filled in for v1.0.
- [ ] A bug list in `docs/QA-FINDINGS.md` with severity and owning agent.
- [ ] A sign-off note in `docs/RELEASE-NOTES.md` once everything is green.

## Test plan

### Smoke

- [ ] Pi cold boot → TV home screen in ≤ 60 s.
- [ ] `http://dartsleague.local` loads the controller on an Android and iOS phone.
- [ ] QR code on TV home resolves to the controller URL.

### Player management

- [ ] Create 5 players with different colors; they appear on the TV home leaderboard skeleton.
- [ ] Edit a player's name; change propagates to the phone list.
- [ ] Soft-delete a player; hidden from new match wizard but historical matches still show the name.

### Match flow — 501 double-out, Bo3, 2 players

- [ ] Start match, TV switches to Match view within 1 s.
- [ ] Each dart submitted shows on TV within 200 ms.
- [ ] Dartboard zoom animation lands on the correct segment.
- [ ] Bust on going below 0 → red flash on phone, TV reverts remaining.
- [ ] Bust on 1 remaining → red flash, revert.
- [ ] Bust on landing 0 with a single → red flash, revert.
- [ ] Valid checkout on D16 → leg ends, TV shows leg-won celebration, scores reset.
- [ ] 180 turn triggers celebration overlay.
- [ ] 100+ checkout triggers high-finish celebration.
- [ ] Bull checkout triggers bull-finish celebration.
- [ ] Match ends when a player reaches `legs_to_win`. TV shows match-won screen.
- [ ] Stats page shows correct 3-dart average and checkout % vs hand calculation.

### Match flow — 301 straight-out, 3 players

- [ ] All three players rotate correctly.
- [ ] Straight-out checkout accepted on a single.

### Match flow — 701 double-out, 5 players

- [ ] All five players rotate in order.
- [ ] Undo across a player boundary restores state cleanly.
- [ ] Long match (~30 min) shows no memory creep on the Pi (`systemctl status` memory line stays flat).

### Resilience

- [ ] Phone in airplane mode for 10 s mid-turn → buffer, reconnect, no dart lost, no dart doubled.
- [ ] TV `F5` refresh mid-leg → full state restored.
- [ ] `sudo systemctl restart dartsleague-backend` mid-leg → TV shows offline pill briefly, reconnects, leg resumes.
- [ ] Pull the Pi's power mid-turn → after reboot, leg resumes at the start of the turn that was in progress (partial turn reverted OR preserved depending on persistence timing — document which).

### Performance

- [ ] Backend RSS < 120 MB after a 30-minute match.
- [ ] CPU temp stays < 70 °C during the match.
- [ ] Zoom animation holds 60 fps visually (eyeball test + Chromium DevTools remote debug).

### Usability

- [ ] Score entry with gloves on: pass / fail.
- [ ] Readability from 3 m: pass / fail.
- [ ] No accidental double-submits during fast scoring: pass / fail.

## Severity definitions

- **S0** — blocks a match from finishing. Must fix before release.
- **S1** — wrong score, wrong stat, or crash. Must fix.
- **S2** — visual glitch, slow animation, ugly layout. Should fix.
- **S3** — nice-to-have.

## Handoff

On full green, tag `v1.0.0` and write `docs/RELEASE-NOTES.md`. On red, kick findings back to the owning agents and re-run the affected sections after fixes.
