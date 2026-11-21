# HEAR main study: export Praat F0 (10 ms, 75-500 Hz) and intensity (10 ms) for every .flac here.
# Run: /Applications/Praat.app/Contents/MacOS/Praat --FULL-TRUST --run export_pitch.praat
list = Create Strings as file list: "list", "*.flac"
n = Get number of strings
writeInfoLine: "files: ", n
for i to n
  selectObject: list
  name$ = Get string: i
  snd = Read from file: name$
  pit = To Pitch: 0.01, 75, 500
  nf = Get number of frames
  txt$ = "time" + tab$ + "f0" + newline$
  for k to nf
    t = Get time from frame number: k
    f = Get value in frame: k, "Hertz"
    if f = undefined
      txt$ = txt$ + fixed$ (t, 3) + tab$ + "NA" + newline$
    else
      txt$ = txt$ + fixed$ (t, 3) + tab$ + fixed$ (f, 2) + newline$
    endif
  endfor
  base$ = replace$ (name$, ".flac", "", 1)
  writeFile: base$ + "_pitch.txt", txt$
  selectObject: snd
  int = To Intensity: 75, 0.01, "yes"
  ni = Get number of frames
  txt$ = "time" + tab$ + "db" + newline$
  for k to ni
    t = Get time from frame number: k
    v = Get value in frame: k
    if v = undefined
      txt$ = txt$ + fixed$ (t, 3) + tab$ + "NA" + newline$
    else
      txt$ = txt$ + fixed$ (t, 3) + tab$ + fixed$ (v, 2) + newline$
    endif
  endfor
  writeFile: base$ + "_intensity.txt", txt$
  appendInfoLine: name$, "  pitch frames: ", nf, "  intensity frames: ", ni
  removeObject: snd, pit, int
endfor
appendInfoLine: "done"
