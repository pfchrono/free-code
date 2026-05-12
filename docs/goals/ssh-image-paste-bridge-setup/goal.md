# Goal: SSH image paste, bridge behavior, and paste-path hardening

## Objective
Restore and harden image paste behavior across SSH-related paste flows, including Warp/local bridge behavior, then document exact working setup, limitations, and reproduction steps.

## Why
Current behavior is unreliable or unclear in at least one SSH image paste path. Goal is end-to-end proof, not partial theory.

## In scope
- SSH image paste flow end to end
- Warp behavior verification
- Local bridge behavior verification
- Adjacent paste-path fixes uncovered during investigation
- Exact setup and reproduction documentation

## Out of scope
- Unrelated editor or terminal features
- Cosmetic refactors not required for paste behavior
- Broad UX changes outside paste flows

## Done when
- Intended image paste flow works in real use
- Warp/local bridge behavior is verified and recorded
- Adjacent paste-path bugs found during work are fixed or clearly documented if external/blocked
- Setup doc explains exact commands, config, and known limits
- Evidence is captured in goal notes

## Proof expected
- Manual end-to-end demo notes
- Commands/config used during verification
- File and code references for final fix
- Clear statement of any remaining external limitation
