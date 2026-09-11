---
version: 1
slug: "components-assistant-globalcoach-tsx"
primary_target: "components/assistant/GlobalCoach.tsx"
related_targets: ["components/assistant/GlobalCoach.module.css","components/assistant/AttachmentPicker.tsx","components/assistant/VoiceCapture.tsx","components/assistant/GlobalCoachEntry.tsx","lib/locales/global-coach.ts"]
---

Scope: Global Ask Trophē launcher and private assistant overlay across authenticated client and professional surfaces. Operate mode, mobile-first PWA.

Audience and job: A client or coach asks a question without losing the current screen, current conversation, or task context. The user may add a photo, use voice, inspect saved conversations, or review a governed action only when needed.

Primary action: Write or speak one question and send it. While a request is active, the same action becomes Stop.

Proof and content: Current screen context, the visible conversation, explicit review cards, saved conversation continuity, and capability-specific receipts. Context is removable and never sent after removal.

Constraints: Preserve existing transports, permissions, subject isolation, action review, memory/history continuity, light/dark parity, Spanish locale copy, 390×844 usability, 16px text input, dynamic viewport and safe-area behavior, reduced motion, reduced-transparency fallback, Escape close, and focus return.

Chosen direction: A compact Siri-like glass overlay within Personal Best. Glass communicates temporary spatial continuity rather than decorating ordinary cards. The current client screen stays legible behind an obsidian or warm-paper conversation layer. A short identity header, conversation log, one context chip, and one composer rail form the complete default view.

Progressive disclosure: The plus menu exposes the permitted photo library and camera inputs. Voice opens from the microphone control. New and saved conversations, memory, diet, and progress live in the header menu. Selected media receive removable previews and governed upload/review states only after selection.

Responsive behavior: On phones the panel is centered above the safe area at no more than 72dvh and follows visual viewport contraction from the keyboard. At 768px and wider it becomes a bounded right-side overlay up to 42rem without shrinking the working surface.

Memorable moment: Ask Trophē rises once over the exact screen the user was viewing; removing the context chip visibly detaches that screen while the conversation remains intact.

Unresolved: None blocking.
