// In-game help pages. Text uses only characters the pixel font has.

export interface HelpPage {
  title: string;
  /** Paragraphs, word-wrapped when drawn; '' adds a blank line. */
  text: string[];
}

export const HELP_PAGES: HelpPage[] = [
  {
    title: 'KRATER',
    text: [
      'TEAMS OF MOLES TAKE TURNS BLOWING HOLES IN THE GROUND AND IN EACH OTHER. THE LAST TEAM WITH A MOLE STANDING WINS.',
      '',
      'EACH TURN ONE MOLE MOVES, AIMS AND FIRES ONE WEAPON. WALKING AND JUMPING USE UP THE MOVE BAR (UNLESS MOVEMENT IS FREE); AFTER THE SHOT THERE ARE A FEW SECONDS TO RUN.',
      '',
      'THE WATER AT THE BOTTOM IS THE END OF A MOLE. SO IS A LONG FALL. AFTER A WHILE THE WATER RISES.',
    ],
  },
  {
    title: 'CONTROLS',
    text: [
      'LEFT RIGHT   WALK',
      'UP DOWN      AIM',
      'SPACE        HOLD TO CHARGE, LET GO TO FIRE',
      'ENTER        JUMP FORWARD',
      'BACKSPACE    BACKFLIP',
      'TAB          WEAPONS',
      '1-5          FUSE OF GRENADES',
      'ESC          PAUSE',
      'Z            ZOOM OUT AND IN',
      '',
      'WITH THE MOUSE: DRAG OR PUSH THE EDGE TO LOOK AROUND, THE WHEEL ZOOMS, CLICK A MARK TO PLACE AIRSTRIKES, TELEPORTS AND GIRDERS.',
      '',
      'ON A GAMEPAD: STICK OR PAD TO WALK AND AIM, A FIRES, B JUMPS, X FLIPS, Y OPENS THE WEAPONS.',
    ],
  },
  {
    title: 'WEAPONS',
    text: [
      'BAZOOKA    BLOWS UP ON CONTACT. MIND THE WIND.',
      'GRENADE    BOUNCES, GOES OFF WHEN THE FUSE RUNS OUT.',
      'CLUSTER    A GRENADE THAT BURSTS INTO FIVE.',
      'SHOTGUN    TWO STRAIGHT SHOTS, AIM AGAIN IN BETWEEN.',
      'DYNAMITE   DROP IT AT YOUR FEET AND RUN.',
      'AIRSTRIKE  FIVE BOMBS ON A MARK. OPEN SKY ONLY.',
      'TELEPORT   BLINK ANYWHERE. ENDS THE TURN.',
      'GIRDER     A STEEL BEAM TO STAND ON OR HIDE BEHIND.',
      'ROPE       SWING ACROSS. FIRE AGAIN TO LET GO.',
      'BAT        A WHACK THAT SENDS THEM FLYING. AIM HIGH OR LOW.',
    ],
  },
  {
    title: 'CRATES AND THE REST',
    text: [
      'CRATES FLOAT DOWN BETWEEN TURNS. WALK INTO ONE: A RED CROSS HEALS 25, A BOMB IS ONE MORE OF A RARE WEAPON.',
      '',
      'A MOLE THAT RUNS OUT OF HEALTH BLOWS UP, AND THAT BLAST HURTS TOO. STAND WELL BACK.',
      '',
      'SET THE TEAMS ON THE TITLE SCREEN: HUMANS SHARE ONE KEYBOARD, CPU MOLES COME IN THREE STRENGTHS.',
    ],
  },
];

/** Breaks a line into lines of at most `max` characters, at the spaces. */
export function wrapText(s: string, max: number) {
  const out: string[] = [];
  for (const para of s.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      if (line && line.length + 1 + word.length > max) {
        out.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    out.push(line);
  }
  return out;
}
