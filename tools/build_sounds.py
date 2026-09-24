"""Turns raw clips in sounds/originals/ into game-ready sounds in sounds/.

Each clip is trimmed to its first sound event, faded out, level-matched and saved as mono MP3 named
after the game sound it replaces (punch.mp3, punch-2.mp3, ...). Ambience clips become seamless loops,
and music becomes a level-matched stereo loop.
Run from the repository root:  python tools/build_sounds.py   (needs ffmpeg on PATH)
Name groups or single sounds to rebuild only those:  python tools/build_sounds.py music murder
"""
import array
import json
import math
import os
import subprocess
import sys

SRC = os.path.join('sounds', 'originals')
DST = 'sounds'

# game sound -> (source clips in variant order, max length in seconds, fade-out in seconds)
EFFECTS = {
    'punch': (['cartoon_punch_impact_#1-1790172675044', 'cartoon_punch_impact_#3-1790172675070', 'cartoon_punch_impact_#4-1790172675063'], 0.5, 0.08),
    'slip': (['cartoon_slip_whistle_#1-1790172377758', 'cartoon_slip_whistle_#2-1790172377759', 'cartoon_slip_whistle_#3-1790172377759', 'cartoon_slip_whistle_#4-1790172377760'], 1.0, 0.1),
    'death': (['death'], 4.5, 0.3),
    'murder': (['murder sound'], 2.0, 0.25),
    'tv': (['start the TV'], 4.2, 0.5),
    'ghost': (['eerie_ghostly_wail_w_#1-1790172522621', 'eerie_ghostly_wail_w_#2-1790172522647', 'eerie_ghostly_wail_w_#3-1790172522719', 'eerie_ghostly_wail_w_#4-1790172522659'], 1.9, 0.3),
    'zap': (['electric shock'], 1.3, 0.25),
    'explosion': (['explosion'], 3.2, 0.8),
    'meteor': (['falling_bomb_whistle_#1-1790172547883', 'falling_bomb_whistle_#2-1790172547890', 'falling_bomb_whistle_#3-1790172547853', 'falling_bomb_whistle_#4-1790172547897'], 2.0, 0.05),
    'fire': (['fire_igniting_whoosh_#1-1790172573133', 'fire_igniting_whoosh_#2-1790172573449', 'fire_igniting_whoosh_#3-1790172573141', 'fire_igniting_whoosh_#4-1790172573106'], 1.6, 0.2),
    'siren': (['fire_truck_siren_wai_#1-1790172598521', 'fire_truck_siren_wai_#2-1790172598549', 'fire_truck_siren_wai_#3-1790172598595', 'fire_truck_siren_wai_#4-1790172598603'], 4.0, 0.05),
    'police': (['European_police_sire_#1-1790172625958', 'European_police_sire_#2-1790172625976', 'European_police_sire_#3-1790172625995', 'European_police_sire_#4-1790172625940'], 1.0, 0.03),
    'gulp': (['gulp_of_a_drink_foll_#1-1790172827403', 'gulp_of_a_drink_foll_#2-1790172827338', 'gulp_of_a_drink_foll_#3-1790172827370'], 0.5, 0.05),
    'crash': (['heavy_bookshelf_topp_#2-1790172421073', 'heavy_bookshelf_topp_#1-1790172421072'], 1.0, 0.2),
    'snap': (['heavy_metal_bear_tra_#1-1790172306703', 'heavy_metal_bear_tra_#3-1790172345613'], 0.6, 0.1),
    'fart': (['long_wet_comedic_far_#1-1790172452094', 'long_wet_comedic_far_#2-1790172452095', 'long_wet_comedic_far_#3-1790172452095', 'long_wet_comedic_far_#4-1790172452096'], 1.0, 0.1),
    'paper': (['paper_note_unfolded__#1-1790172737629', 'paper_note_unfolded__#2-1790172737938', 'paper_note_unfolded__#3-1790172737657'], 0.9, 0.1),
    'splash': (['person_jumping_into__#1-1790172651274', 'person_jumping_into__#2-1790172651288', 'person_jumping_into__#3-1790172651249', 'person_jumping_into__#4-1790172651281'], 1.6, 0.3),
    'fail': (['sad_trombone_wah-wah_#1-1790172800642', 'sad_trombone_wah-wah_#2-1790172800595'], 3.0, 0.2),
    'scream': (['short_cartoon_scream_#1-1790172490405', 'short_cartoon_scream_#2-1790172490405', 'short_cartoon_scream_#3-1790172490405', 'short_cartoon_scream_#4-1790172490406'], 1.9, 0.2),
    'win': (['short_mischievous_vi_#1-1790172774162', 'short_mischievous_vi_#2-1790172774225', 'short_mischievous_vi_#3-1790172774189', 'short_mischievous_vi_#4-1790172782355'], 1.6, 0.2),
    'knock': (['three_knocks_on_a_wo_#1-1790172710761', 'three_knocks_on_a_wo_#2-1790172710790', 'three_knocks_on_a_wo_#3-1790172710751', 'three_knocks_on_a_wo_#4-1790172711093'], 0.9, 0.1),
}
# Background loops: game name -> (source clips, crossfade seconds)
AMBIENCE = {
    'amb-day': (['suburban_backyard_am_#1-1790172931716', 'suburban_backyard_am_#2-1790172931702', 'suburban_backyard_am_#3-1790172931703', 'suburban_backyard_am_#4-1790172931704'], 2.0),
    'amb-night': (['night_ambience,_cric_#2-1790173017449', 'night_ambience,_cric_#3-1790173017449', 'night_ambience,_cric_#4-1790173027607'], 1.0),
}
# Music: game name -> (source track, crossfade seconds at the loop seam)
MUSIC = {
    'music-pause': ('Pause music', 1.0),
}
TARGET_DB = -10.0  # loudest 10 ms of every effect lands here
MUSIC_LUFS = -18.0  # music is level-matched to this integrated loudness


def envelope(path, sr=8000, frame=80):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(sr), '-f', 's16le', '-'], capture_output=True, check=True).stdout
    a = array.array('h')
    a.frombytes(raw[:len(raw) // 2 * 2])
    db = []
    for i in range(len(a) // frame):
        seg = a[i * frame:(i + 1) * frame]
        db.append(20 * math.log10(math.sqrt(sum(x * x for x in seg) / frame) / 32768 + 1e-9))
    return db, len(a) / sr


def first_event(db):
    """Start and end (seconds) of the first sound event, bridging gaps under 150 ms."""
    peak = max(db)
    thr = max(peak - 30, -50)
    start = next(i for i, v in enumerate(db) if v > thr)
    end, gap = start, 0
    for i in range(start, len(db)):
        if db[i] > thr:
            end, gap = i, 0
        else:
            gap += 1
            if gap > 15:
                break
    return start * 0.01, (end + 1) * 0.01, peak


def effect(src, dst, max_len, fade):
    db, dur = envelope(src)
    start, end, peak = first_event(db)
    start = max(0.0, start - 0.005)
    length = min(max_len, end + 0.25 - start, dur - start)
    fade = min(fade, length * 0.4)
    gain = max(-20.0, min(20.0, TARGET_DB - peak))
    af = f'atrim=start={start:.3f}:duration={length:.3f},asetpts=PTS-STARTPTS,volume={gain:.1f}dB,afade=t=out:st={length - fade:.3f}:d={fade:.3f}'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-af', af, '-ac', '1', '-ar', '44100', '-b:a', '96k', dst], check=True)
    return length, gain


def seam(dur, xfade, level):
    """Filter graph that folds the last `xfade` seconds over the first, so the clip loops without a click."""
    body_end = dur - xfade
    return (f'[0:a]asplit=3[x][y][z];'
            f'[x]atrim=start={xfade}:end={body_end:.3f},asetpts=PTS-STARTPTS[body];'
            f'[y]atrim=start={body_end:.3f},asetpts=PTS-STARTPTS,afade=t=out:d={xfade}:curve=qsin[tail];'
            f'[z]atrim=end={xfade},asetpts=PTS-STARTPTS,afade=t=in:d={xfade}:curve=qsin[head];'
            f'[tail][head]amix=inputs=2:normalize=0[mix];'
            f'[body][mix]concat=n=2:v=0:a=1,{level}[out]')


def loop(src, dst, xfade):
    _, dur = envelope(src)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-filter_complex', seam(dur, xfade, 'loudnorm=I=-26:TP=-3'),
                    '-map', '[out]', '-ac', '1', '-ar', '44100', '-b:a', '64k', dst], check=True)
    return dur - xfade


def music(src, dst, xfade):
    """A stereo loop turned up or down to MUSIC_LUFS (a plain gain, so the mix keeps its dynamics)."""
    _, dur = envelope(src)
    report = subprocess.run(['ffmpeg', '-hide_banner', '-i', src, '-vn', '-af', 'loudnorm=print_format=json', '-f', 'null', '-'],
                            capture_output=True, text=True, encoding='utf-8', errors='replace', check=True).stderr
    measured = float(json.loads(report[report.rindex('{'):report.rindex('}') + 1])['input_i'])
    gain = MUSIC_LUFS - measured
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-filter_complex', seam(dur, xfade, f'volume={gain:.1f}dB,alimiter=limit=0.9'),
                    '-map', '[out]', '-ac', '2', '-ar', '44100', '-b:a', '128k', dst], check=True)
    return dur - xfade, gain


def main(groups):
    for name, (clips, max_len, fade) in EFFECTS.items():
        if 'effects' in groups or name in groups:
            for i, clip in enumerate(clips):
                out = os.path.join(DST, f'{name}.mp3' if i == 0 else f'{name}-{i + 1}.mp3')
                length, gain = effect(os.path.join(SRC, clip + '.mp3'), out, max_len, fade)
                print(f'{out:28} {length:5.2f}s {gain:+5.1f}dB')
    if 'ambience' in groups:
        for name, (clips, xfade) in AMBIENCE.items():
            for i, clip in enumerate(clips):
                out = os.path.join(DST, f'{name}.mp3' if i == 0 else f'{name}-{i + 1}.mp3')
                print(f'{out:28} {loop(os.path.join(SRC, clip + ".mp3"), out, xfade):5.2f}s loop')
    if 'music' in groups:
        for name, (track, xfade) in MUSIC.items():
            out = os.path.join(DST, f'{name}.mp3')
            length, gain = music(os.path.join(SRC, track + '.mp3'), out, xfade)
            print(f'{out:28} {length:5.2f}s loop {gain:+5.1f}dB')


if __name__ == '__main__':
    main(set(sys.argv[1:]) or {'effects', 'ambience', 'music'})
