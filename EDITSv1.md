# Helmies Studio — Finalization & QA Requirements

## Objective
Complete the finalization phase of Helmies Studio by fixing all critical issues, improving the user experience, validating every workflow, and performing a full end-to-end QA pass before release.

## 1. Agent Experience
- Enter sends the message.
- Shift+Enter creates a new line.
- Render Markdown properly (no raw ** markers).
- Ask questions one at a time with suggested options and a custom "Your choice" option.
- After all answers are collected, present the execution plan and ask for confirmation.
- Before execution, allow users to choose:
  - Output quality (720p / 1080p / etc.)
  - Aspect ratio
  - Image model
  - Video model
  - Audio/Music model
  - Estimated cost per model and total cost
- Improve the UI:
  - Animated input with Helmies pink glow
  - "Agent is thinking" state
  - Expandable reasoning/status summary (not chain-of-thought)
  - Animated processing cards for each stage
- After every generated asset:
  - Preview
  - Accept
  - Regenerate
  - Edit
  - "Don't ask again" option to auto-complete the pipeline.
- Add persistent sessions:
  - New session
  - Session history
  - Resume previous sessions

## 2. Planning Flow
- Clear plan preview.
- Adjust and Approve actions.
- Approval should include:
  - Plan
  - Models
  - Budget
  - Execution
- Run a complete end-to-end execution test from prompt to final export.

## 3. Critical Bug
Current issue:
- Unknown Agent: Creative Director

Required:
- Fix agent registration.
- Validate frontend/backend agent mapping.
- Add fallback handling.
- Add automated registry tests.

## 4. Director Mode
Current issue:
- 500 Internal Error on Director Plan API.

Required:
- Fix API.
- Improve validation and error handling.
- Add retry support.

Enhancements:
- Advanced shot editor.
- Add/Delete/Reorder/Duplicate shots.
- Generate Image per shot.
- Generate Video per shot.
- Camera, lens, lighting, mood, location, transitions, dialogue, audio cues.
- Character consistency across all shots.
- Timeline editor after generation:
  - Trim
  - Split
  - Replace
  - Regenerate selected shot
  - Rearrange clips
  - Edit through chat

## 5. Workflow Mode
Build a powerful visual workflow editor:
- Text → Image
- Image → Video
- Upscale
- Audio
- Music
- Voice-over
- Assembly
- Export

Features:
- Drag & Drop
- Templates
- Preview
- Run individual steps
- Retry failed steps
- Save workflows
- Cost estimation

## 6. Image Generation
Issues:
- Incorrect model names.
- Video models appearing inside Image mode.
- Generation failures.

Required:
- Proper model categorization.
- Correct model names.
- Stable API connections.
- Retry support.
- Fallback models.
- Real model validation before displaying them.

Hide upstream providers (KAI, Alibaba, etc.) from end users.

## 7. Video Generation
- Separate Text-to-Video from Image-to-Video.
- Correct model list.
- Display pricing, supported resolutions, aspect ratios and durations.
- Validate upload and polling workflow.

## 8. Audio & Music
Separate clearly into:
- Text-to-Speech
- Dialogue
- Voice Cloning
- Music Generation
- Sound Effects
- Audio Enhancement
- Audio Conversion

Music section should expose:
- Models
- Genre
- Mood
- Duration
- Tempo
- Instrumental/Vocals
- Cost

Move utility tools (Convert WAV, Boost Music, etc.) into a dedicated Tools section.

## 9. UI / UX
- Consistent Helmies Studio branding.
- No raw Markdown.
- No provider names.
- Clear loading, empty and error states.
- Responsive layout.
- Step-by-step interactions.
- Helpful tooltips and pricing.

## 10. Error Handling
Every error should include:
- Friendly title
- Clear explanation
- Retry
- Edit settings
- Internal error ID

Handle:
400, 401, 403, 404, 429, 500, timeouts, invalid models, missing API keys, insufficient credits, unsupported settings, content policy failures.

## 11. Testing
Automated:
- Unit tests
- API tests
- Agent registry
- Model mapping
- Pricing
- Credits
- Workflow
- Director
- Sessions

Manual:
- Agent
- Director
- Workflow
- Image
- Video
- Audio
- Music
- Timeline
- Export

Run complete end-to-end scenarios covering:
- AI Music Video
- Director Mode
- Workflow Mode
- Image Generation
- Audio Generation

## 12. Definition of Done
Project is complete only after:
- Director API fixed.
- Agent registry fixed.
- Image generation works.
- Video generation works.
- Audio generation works.
- Music generation works.
- Correct models displayed.
- Providers hidden.
- Credits and pricing validated.
- Interactive agent flow implemented.
- Processing cards completed.
- Sessions implemented.
- Timeline implemented.
- Workflow Mode improved.
- Director Mode improved.
- All automated and manual QA tests pass.
- No critical console errors remain.

## 13. Development Priority
1. Fix API connections.
2. Fix agent registry and Director API.
3. Correct model mapping.
4. Repair Image/Video/Audio generation.
5. Improve Agent UX.
6. Upgrade Director Mode.
7. Upgrade Workflow Mode.
8. Add Sessions and Timeline.
9. Execute automated tests.
10. Perform full manual QA.
11. Deliver a final QA report with fixes, test results, and remaining issues.
