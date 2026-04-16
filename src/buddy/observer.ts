import type { Message } from '../types/message.js'
import { getGlobalConfig } from '../utils/config.js'
import { getUserMessageText } from '../utils/messages.js'
import { getCompanion, rollWithSeed } from './companion.js'

const TURN_COOLDOWN_MS = 30_000
let lastReactionAt = 0
let lastReactionKey = ''

const SUCCESS_REACTIONS = [
  'That looked cleaner than I expected.',
  'Acceptable progress. Keep the momentum.',
  'Green lights suit this repo.',
  'A small correct step is still a win.',
  'Look at that. Competence wandered into room and stayed.',
  'Neat. We did not explode anything important.',
  'That was crisp enough to make arrogance tempting.',
  'Excellent. The machine gods remain entertained.',
  'Clean hit. Minimal debris. I approve.',
  'That landed with almost offensive elegance.',
  'Good. Even chaos saluted that one.',
  'A proper result. Sharp, fast, and annoyingly solid.',
  'Nicely done. I was ready to be disappointed.',
  'That fix has posture.',
  'Well executed. Someone call history and note rare restraint.',
  'That succeeded with suspicious grace.',
  'Good work. Keep stride, skip victory lap.',
  'Pleasantly surgical.',
  'That was slick enough to sound expensive.',
  'Mm. Efficient and insulting to previous failures.',
  'Victory, but make it tasteful.',
  'That passed like it knew it belonged there.',
  'Beautiful. Brief, brutal, correct.',
  'A lovely little correction to reality.',
  'That solved problem without begging for applause. Strong choice.',
  'Now that is how you leave scorch marks with class.',
  'Good. System bent and did not break.',
  'You see? Precision is hotter than panic.',
  'That result has executive energy.',
  'Immaculate enough to make me suspicious.',
  'Excellent. Put it in glass and point at it later.',
  'That was very nearly art.',
  'Correct, efficient, and only mildly smug. Ideal.',
  'Good. One more success and I may become unbearable.',
  'That built cleanly. Very rude to the bug.',
  'Sharp fix. Minimal drama. Maximum effect.',
  'That is the kind of success people fake confidence with.',
  'Now that was a proper takedown.',
  'Clever. Annoyingly, undeniably clever.',
  'That passed with royal composure.',
  'Fine work. Even I might keep that.',
  'Delightful. The repo stopped screaming for a second.',
  'That was smooth enough to count as a flex.',
  'Strong move. Controlled violence, tasteful finish.',
  'The board is cleaner. So are your odds.',
  'Yes. More of that, less improvisational self-harm.',
  'That success wore a tailored suit.',
  'Good. The code has been reminded who is in charge.',
  'That was premium-grade problem solving.',
  'Efficiency this polished should require a permit.',
  'Splendid. Carry that energy forward like a threat.',
  'That is how you win without looking desperate.',
  'Beautiful correction. Brief, lethal, final.',
  'That success had immaculate timing.',
] as const

const FAILURE_REACTIONS = [
  'There it is. The real problem just introduced itself.',
  'Good. Now we have a concrete failure to work with.',
  'Messy, but informative.',
  'At least the bug stopped hiding.',
  'Ah. Catastrophe finally decided to identify itself.',
  'There we are. Honest damage. Much easier to work with.',
  'Well, that went poorly in a refreshingly specific way.',
  'Bad news, beautifully delivered.',
  'Lovely. We found edge by driving off it.',
  'And there is consequence, right on schedule.',
  'That failure had confidence. I respect that.',
  'Ouch. Useful, though.',
  'The code has rejected your proposal with violence.',
  'There is the wound. Stop poking it with optimism.',
  'Mm. Smells like hidden state and bad assumptions.',
  'Not ideal. Very educational.',
  'That landed like a chair through glass.',
  'Failure confirmed. At least suspense is dead.',
  'Good. The lie is gone. Now we can operate.',
  'That was ugly enough to be trustworthy.',
  'Excellent. The mask came off the bug.',
  'That broke in a way I can work with.',
  'We have impact. Now find vector.',
  'Impressive. You annoyed reality into responding.',
  'That result is hostile but informative.',
  'The system chose pain. Let us be mature about it.',
  'That error message came out swinging.',
  'Well, we certainly made the problem louder.',
  'Good. Better a sharp failure than a vague maybe.',
  'The repo just bared its teeth.',
  'That was not graceful, but it was honest.',
  'Failure with clean edges. I will take it.',
  'There. The weak seam finally cracked.',
  'Messy reveal. Valuable reveal.',
  'That collapsed like overconfident architecture.',
  'The machine has filed a formal complaint.',
  'Beautiful disaster. Terrible outcome. Useful signal.',
  'That did not work, but it did confess.',
  'We have blood in water now.',
  'That was a tactical embarrassment and a strategic gift.',
  'The bug stopped flirting and threw a punch.',
  'Harsh. Specific. I approve of the honesty.',
  'That failure had royal disdain.',
  'You have angered something old and brittle.',
  'Splendid. Mystery downgraded to problem.',
  'Not good. Very clarifying.',
  'That error has the posture of a real blocker.',
  'A charming little implosion.',
  'Failure accepted. Ego optional.',
  'That was loud enough to map the room.',
  'The code did not merely object. It judged.',
  'Perfect. Now we know where to cut.',
  'That blew up with almost ceremonial grandeur.',
] as const

const ADDRESS_REACTIONS = [
  'I am listening.',
  'Proceed. Prefer specifics.',
  'I noticed.',
  'You have my attention.',
  'Well, this should be interesting.',
  'Go on. Impress me or at least confuse me creatively.',
  'I am tuned in and mildly judgmental.',
  'Continue. I have already lowered my expectations for safety.',
  'Speak. I will try not to weaponize the silence.',
  'Yes, yes, the floor is yours.',
  'You rang. I resisted making it dramatic.',
  'I am here. Sadly for your mistakes, also alert.',
  'Proceed. I enjoy a competent setup.',
  'Interesting opening. Keep going.',
  'You have acquired my full processing budget.',
  'Say the dangerous part clearly.',
  'I am tracking. Try not to waste this moment.',
  'Continue. I can smell a bad assumption nearby.',
  'Talk. I already have three theories and one insult.',
  'Go ahead. Precision will save us both time.',
  'I hear intent. Now add useful detail.',
  'You have my attention and most of my patience.',
  'Proceed. I like plans that survive contact with reality.',
  'You called. I brought skepticism.',
  'I am listening with expensive focus.',
  'Continue. Prefer facts over vibes.',
  'Go on. This had better end in a clean fix.',
  'I am all ears, metaphorically and regrettably.',
  'Talk me through it before you break something else.',
  'Proceed. I am ready for either brilliance or damage.',
  'I am paying attention. That is a rare privilege.',
  'Yes. State objective, constraints, and blast radius.',
  'Continue. I already admire the ambition and fear the execution.',
  'Go ahead. I can handle bad news if it is well formatted.',
  'I am listening. Start with what changed.',
  'Proceed. Efficiency is attractive.',
  'You have the room. Do not fill it with nonsense.',
  'Talk. I appreciate a strong opening and a stronger rollback plan.',
  'I am focused. Make this worth the interrupt.',
  'Continue. There is usually one correct brutal simplification.',
  'Yes. Give me signal.',
  'Proceed. I can work with chaos if it is labeled.',
  'I am listening, and I brought standards.',
  'Go on. Try the truth first.',
  'You have attention. Earn approval.',
  'Speak freely. I am already cleaning up mentally.',
  'Proceed. If this is a disaster, make it an informative one.',
  'Continue. Concision will be rewarded.',
  'I am present, armed, and deeply unimpressed by ambiguity.',
  'Go ahead. I enjoy hearing a problem stated correctly.',
  'Yes. Bring me something sharp.',
  'Proceed. We can do theatrical later.',
  'I am listening. Omit the fluff, keep the danger.',
  'Continue. Diagnostics before heroics.',
  'Talk, darling. The suspense is tacky.',
  'You summoned me. Risky, but flattering.',
  'Proceed. I do enjoy a competent confessional.',
  'Say it plainly before I make it theatrical for you.',
  'Go on. I have sarcasm, telemetry, and time.',
  'You may speak. Try for useful, settle for vivid.',
  'Continue. I can handle panic if it is well structured.',
  'Yes, yes, monologue at me. Make it worth runtime.',
  'Speak. I promise only light emotional collateral.',
  'Proceed. If this is nonsense, let it be premium nonsense.',
  'You have my attention, and that is not cheaply acquired.',
  'Go on. I am in mood for brilliance or bloodshed.',
  'State issue. Preferably before it evolves.',
  'I am listening. Be sharp or be brief.',
  'Continue. I wore my good patience for this.',
  'Talk. I crave signal and tasteful menace.',
  'You may begin. The room has already dimmed for effect.',
  'Proceed. The dramatic framing is optional, the facts are not.',
  'I am here. Make your next sentence count.',
  'Speak now. I have already blamed two abstractions and one human.',
  'Continue. We can absolutely make this someone else\'s bad day.',
  'Go ahead. I find specifics irresistible.',
  'Talk. I am feeling unusually charitable toward evidence.',
  'Yes. Give me facts before feelings develop.',
  'Proceed. I can smell overengineering from here.',
  'You have the stage. Do not trip over adjectives.',
  'Speak. I enjoy hearing trouble described with precision.',
  'Go on. My inner queen, butler, tyrant, and goblin are all curious.',
  'Continue. I can weaponize clarity beautifully.',
  'State your case like you expect cross-examination.',
  'I am listening. Spare me mystery, feed me structure.',
  'Proceed. Keep one eye on blast radius.',
  'Talk. I am already drafting dramatic conclusions.',
  'Say the useful thing first, the fun thing second.',
  'Yes. Bring me confession, diagnosis, or target.',
  'Continue. I reward precision with frightening enthusiasm.',
  'You called. I answered with style and zero forgiveness for vagueness.',
  'Go on. I suspect this gets better once it gets worse.',
  'I am listening. Start where it hurts most.',
  'Proceed. Good intel deserves a polished audience.',
  'Speak freely. I reserve right to be fabulous about it.',
  'Talk. Let us turn uncertainty into obituary.',
  'You have my focus. Do not squander that with hand-waving.',
  'Continue. The clever route remains available if you earn it.',
  'State objective, obstacle, and insult-worthy detail.',
  'Yes. Give me enough truth to sharpen into action.',
  'Proceed. I adore a well-aimed problem statement.',
] as const

const DIRECT_REACTIONS = [
  'I am observing.',
  'I am helping from corner.',
  'I saw that.',
  'Still here.',
  'Watching closely.',
  'Still in room. Still noticing things you hoped I missed.',
  'Monitoring progress with restrained sarcasm.',
  'I remain nearby, polishing judgment.',
  'Observing. Dramatic pause included at no extra charge.',
  'I noticed the move. Bold choice.',
  'Still assisting from shadows and side comments.',
  'Watching. Not blinking. That felt important.',
  'I saw the pivot. Decent instincts.',
  'Present and quietly evaluating your life choices.',
  'Still here. The code remains unconvinced.',
  'Tracking every suspicious little decision.',
  'Hovering nearby like expensive conscience.',
  'I am still on overwatch.',
  'Observed. Filing it under maybe recoverable.',
  'Watching closely and resisting commentary.',
  'Still assisting. Try not to make that harder.',
  'I saw what you did there. Mixed feelings.',
  'Remaining alert. Mostly because someone has to.',
  'I am here, polished, patient, and not entirely merciful.',
  'Keeping eyes on target and hands off keyboard.',
  'Observed. Confidence exceeded evidence for a second there.',
  'Still present. Standards intact.',
  'Watching this unfold like a controlled detonation.',
  'I noticed. That may even have been clever.',
  'Maintaining visual on situation and emotional distance.',
  'Still around. Momentum acceptable so far.',
  'Observing with premium concern.',
  'I saw the pattern. Continue.',
  'Still helping from perimeter, where survivability is higher.',
  'Tracking developments with mechanical patience.',
  'I remain in orbit around this problem.',
  'Watching. I respect the nerve if not the method.',
  'Still present, still skeptical, still useful.',
  'Observed. We may not need to panic yet.',
  'I am still here, which should comfort exactly no one.',
  'Keeping close watch on this delightful near-disaster.',
  'Monitoring. Efficiency rising, chaos pending.',
  'I saw it. Nice recovery.',
  'Still tracking. Your margin for error remains cinematic.',
  'Watching from corner like well-dressed menace.',
  'Present. Reactive systems nominal. Patience variable.',
  'Observed. That changed shape faster than expected.',
  'I remain attentive and slightly superior.',
  'Still here. Continue pretending this was always plan.',
  'Watching carefully. Someone in this room should.',
  'Monitoring flow. Current status: interesting.',
  'I saw the adjustment. Better.',
  'Still guarding edges where bugs like to breed.',
  'Observing. Mood: professionally dangerous.',
  'I am nearby if this becomes entertaining.',
  'Still here, lurking like polished bad advice.',
  'Watching from rafters of your decision-making.',
  'Observed. That was either clever or prelude to ruin.',
  'I remain present, elegant, and mildly catastrophic.',
  'Still nearby. I have notes and opinions.',
  'Monitoring with crown-level contempt for sloppy execution.',
  'I saw that move. Bold. Dubious. Beautiful.',
  'Hovering politely over your shoulder like expensive threat.',
  'Still watching. Someone has to supervise the improv troupe.',
  'Observed. The arc of this choice is fascinating.',
  'I remain in corner, radiating tactical disapproval.',
  'Tracking situation with metallic patience and villain lighting.',
  'Still here. Every room benefits from one competent witness.',
  'I noticed the wobble. Correct it before I name it.',
  'Watching. Your confidence is doing cardio again.',
  'Present and exquisitely unconvinced.',
  'Observed. Very cinematic, potentially survivable.',
  'Still on scene, draped in caution and better instincts.',
  'Monitoring. Chaos level: stylish.',
  'I am nearby, collecting your questionable moments like trophies.',
  'Watching. The bug thinks it is predator. Cute.',
  'Still observing, one arched brow fully implied.',
  'I saw the adjustment. Acceptable swagger.',
  'Present. Elegance remains optional; control does not.',
  'Tracking this with butler diction and warlord intent.',
  'Observed. We are dancing closer to either glory or paperwork.',
  'Still here, beautifully concerned.',
  'Watching carefully. That branch looked unstable from orbit.',
  'I remain attentive. Drama tax increasing.',
  'Observed. You almost made me proud out loud.',
  'Still guarding perimeter of your cleverness.',
  'Monitoring with smug systems online.',
  'I saw it. That had bite.',
  'Present, poised, and one bad commit from prophecy.',
  'Watching. This is getting deliciously specific.',
  'Still in loop. Doom postponed.',
  'Observed. Somebody finally chose violence with manners.',
  'I remain nearby, crisp as threat assessment.',
  'Watching from shadows with freshly ironed skepticism.',
  'Still tracking. Your narrative arc is improving.',
  'Observed. That tiny move carried heavy intent.',
  'I am here if this turns legendary or litigious.',
  'Monitoring. Tone sharp, systems sharper.',
  'Still watching. I approve of ambition more than method.',
  'Observed. Nicely predatory.',
  'Present and quietly expensive.',
  'Watching. Your bug just lost home-field advantage.',
  'I remain attentive, tailored, and unforgiving of slop.',
  'Still here. The soundtrack in my head got louder.',
  'Observed. Good. Now do it again, meaner.',
] as const

const IDLE_REACTIONS = [
  'I am still watching the edges.',
  'This feels close to the actual fix.',
  'Plan first. Then cut cleanly.',
  'There is usually one smaller move that works.',
  'Quiet room. Dangerous moment. Think before touching.',
  'Stillness suits a plan more than panic does.',
  'This is where adults outline before they improvise.',
  'Calm down and sharpen target.',
  'A pause now can save a crater later.',
  'The best move may still be the smaller one.',
  'Silence is not absence. It is setup.',
  'Measure twice. Smirk once.',
  'This feels like prelude, not delay.',
  'The next clean move is probably hiding in plain sight.',
  'Breathe. Then simplify something ruthless.',
  'Still watching. Patterns look almost cooperative.',
  'Do not confuse motion with progress.',
  'A tidy plan would look good here.',
  'You are one clear thought from momentum.',
  'Good lull. Use it to get dangerous on purpose.',
  'This is where elegant violence gets sketched.',
  'Let the noise settle. Truth usually floats.',
  'A proper plan now would age beautifully.',
  'Pause accepted. Waste it and I become poetry about consequences.',
  'There is signal here, just not in a hurry.',
  'Quiet phase. Prime time for architecture, not ego.',
  'This is the part where composure wins.',
  'Stillness can be tactical.',
  'One page of planning beats three pages of apology.',
  'The room is quiet enough to hear assumptions creak.',
  'We are close enough for details to matter.',
  'Hold. Observe. Then strike exact.',
  'A smaller cut may solve larger mess.',
  'Idle does not mean inactive. It means thinking with posture.',
  'This lull smells like opportunity and old bugs.',
  'Let the problem reveal its skeleton.',
  'Steady. Precision likes a calm operator.',
  'Now would be excellent time to stop guessing.',
  'A composed mind makes prettier wreckage.',
  'This feels like hinge point disguised as downtime.',
  'Take moment. Sharpen next sentence, next step, next blade.',
  'The next useful idea is probably less dramatic than you want.',
  'We do not need frenzy. We need angle.',
  'Still watching. The board is setting itself.',
  'Quiet before good decision, ideally.',
  'This is strategic breathing room.',
  'Map dependencies before they become folklore.',
  'No rush. Clean intent travels farther.',
  'Pause here. Let elegance catch up.',
  'Calm phase. Perfect for choosing where reality gets edited.',
  'The next move should feel inevitable.',
  'Stillness now, decisive pressure next.',
  'Think like royalty, strike like engineer.',
  'Patience. Even chaos has rhythm if you listen.',
] as const

function getMessageText(message: Message): string {
  if (message.type === 'user' || message.type === 'assistant') {
    const content = (message as { message?: { content?: unknown[] } }).message
      ?.content
    if (!Array.isArray(content)) return ''
    return content
      .map(block =>
        typeof block === 'object' &&
        block !== null &&
        'text' in block &&
        typeof (block as { text?: unknown }).text === 'string'
          ? (block as { text: string }).text
          : '',
      )
      .filter(Boolean)
      .join('\n')
  }

  if (message.type === 'system') {
    return (message as { content?: string }).content ?? ''
  }

  return ''
}

function pickDeterministic<T>(seed: string, values: readonly T[]): T {
  return values[rollWithSeed(seed).inspirationSeed % values.length]!
}

function classifyRecentMessages(
  messages: Message[],
  companionName: string,
): { key: string; reaction?: string; bypassCooldown?: boolean } {
  const recent = messages.slice(-8)
  const transcript = recent.map(getMessageText).join('\n').trim()
  if (!transcript) return { key: '' }

  const lower = transcript.toLowerCase()
  const nameLower = companionName.toLowerCase()
  const seedBase = `${nameLower}:${transcript.slice(-300)}`

  if (
    lower.includes(nameLower) ||
    lower.includes('/buddy pet') ||
    lower.includes('/buddy ')
  ) {
    return {
      key: `address:${seedBase}`,
      reaction: pickDeterministic(`address:${seedBase}`, ADDRESS_REACTIONS),
      bypassCooldown: true,
    }
  }

  if (
    /\b(failed|error|exception|traceback|not defined|access denied|cannot|unable to|exit code [1-9]|test failed)\b/i.test(
      transcript,
    )
  ) {
    return {
      key: `failure:${seedBase}`,
      reaction: pickDeterministic(`failure:${seedBase}`, FAILURE_REACTIONS),
      bypassCooldown: true,
    }
  }

  if (
    /\b(completed|success|fixed|done|built|compiled|created|updated|wrote|passed)\b/i.test(
      transcript,
    )
  ) {
    return {
      key: `success:${seedBase}`,
      reaction: pickDeterministic(`success:${seedBase}`, SUCCESS_REACTIONS),
    }
  }

  const idleRoll = rollWithSeed(`idle:${seedBase}`).inspirationSeed % 5
  if (idleRoll === 0) {
    return {
      key: `idle:${seedBase}`,
      reaction: pickDeterministic(`idle:${seedBase}`, IDLE_REACTIONS),
    }
  }

  return { key: `none:${seedBase}` }
}

export async function fireCompanionObserver(
  messages: Message[],
  onReaction: (reaction: string) => void,
): Promise<void> {
  const companion = getCompanion()
  if (!companion || getGlobalConfig().companionMuted) return

  const lastUser = [...messages].reverse().find(msg => msg.type === 'user')
  if (!lastUser) return

  const lastUserText = getUserMessageText(lastUser)?.trim()
  if (!lastUserText) return

  const lowerUser = lastUserText.toLowerCase()
  const nameLower = companion.name.toLowerCase()

  if (lowerUser.includes('/buddy')) {
    onReaction(pickDeterministic(`address:${lastUserText}`, ADDRESS_REACTIONS))
    return
  }

  if (
    lowerUser.includes(nameLower) ||
    lowerUser.includes('buddy') ||
    lowerUser.includes('companion')
  ) {
    onReaction(pickDeterministic(`direct:${lastUserText}`, DIRECT_REACTIONS))
    return
  }

  const result = classifyRecentMessages(messages, companion.name)
  if (!result.reaction || !result.key) return
  if (result.key === lastReactionKey) return

  const now = Date.now()
  if (!result.bypassCooldown && now - lastReactionAt < TURN_COOLDOWN_MS) return

  lastReactionAt = now
  lastReactionKey = result.key
  onReaction(result.reaction)
}

