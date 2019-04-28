var MIN_SAMPLES = 0;  // will be initialized when AudioContext is created.
var GOOD_ENOUGH_CORRELATION = 0.9; // this is the "bar" for how close a correlation needs to be

function autoCorrelate( buf, sampleRate ) {
    var SIZE = buf.length;
    var MAX_SAMPLES = Math.floor(SIZE/2);
    var best_offset = -1;
    var best_correlation = 0;
    var rms = 0;
    var foundGoodCorrelation = false;
    var correlations = new Array(MAX_SAMPLES);

    for (var i=0;i<SIZE;i++) {
        var val = buf[i];
        rms += val*val;
    }
    //rms = Math.sqrt(rms/SIZE);
    if (rms <0.001){// not enough signal
        return -1;
    }

    var lastCorrelation=1;
    for (var offset = MIN_SAMPLES; offset < MAX_SAMPLES; offset++) {
        var correlation = 0;

        for (var i=0; i<MAX_SAMPLES; i++) {
            correlation += Math.abs((buf[i])-(buf[i+offset]));
        }
        correlation = 1 - (correlation/MAX_SAMPLES);
        correlations[offset] = correlation; // store it, for the tweaking we need to do below.
        if ((correlation>GOOD_ENOUGH_CORRELATION) && (correlation > lastCorrelation)) {
            foundGoodCorrelation = true;
            if (correlation > best_correlation) {
                best_correlation = correlation;
                best_offset = offset;
            }
        } else if (foundGoodCorrelation) {
            // short-circuit - we found a good correlation, then a bad one, so we'd just be seeing copies from here.
            // Now we need to tweak the offset - by interpolating between the values to the left and right of the
            // best offset, and shifting it a bit.  This is complex, and HACKY in this code (happy to take PRs!) -
            // we need to do a curve fit on correlations[] around best_offset in order to better determine precise
            // (anti-aliased) offset.

            // we know best_offset >=1,
            // since foundGoodCorrelation cannot go to true until the second pass (offset=1), and
            // we can't drop into this clause until the following pass (else if).
            var shift = (correlations[best_offset+1] - correlations[best_offset-1])/correlations[best_offset];
            return sampleRate/(best_offset+(8*shift));
        }
        lastCorrelation = correlation;
    }
    if (best_correlation > 0.01) {
        // console.log("f = " + sampleRate/best_offset + "Hz (rms: " + rms + " confidence: " + best_correlation + ")")
        return sampleRate/best_offset;
    }
    return -1;
    //	var best_frequency = sampleRate/best_offset;
}

function getNote(frequency) {
  const note = 12 * (Math.log(frequency/440) / Math.log(2))
  return Math.round(note) + 69;
}
function getStandardFrequency(note) {
  return 440 * Math.pow(2, (note - 69) / 12)
}
function getCents(frequency, note) {
  return Math.floor(
    (1200 * Math.log(frequency / getStandardFrequency(note))) / Math.log(2)
  )
}

var noteStrings = [
    'C',
    'C#',
    'D',
    'D#',
    'E',
    'F',
    'F#',
    'G',
    'G#',
    'A',
    'A#',
    'B'
]
var currentStrings = [
    'C0',
    'C#0',
    'D0',
    'D#0',
    'E0',
    'F0',
    'F#0',
    'G0',
    'G#0',
    'A0',
    'A#0',
    'B0'
]

function init() {
    var waveform = document.getElementById( "waveform" );
    waveform.width = document.body.clientWidth;
    waveform.height = document.body.clientHeight;

    var freqData = new Array(512);
    freqData.fill(-1);

    var streamReceived = function(stream) {
        var context = new AudioContext();

        var analyser = context.createAnalyser();
        analyser.smoothingTimeConstant = 0.8;
        analyser.fftSize = 2048;

        var sourceAudioNode = context.createMediaStreamSource(stream);
        var filter = context.createBiquadFilter();

        sourceAudioNode.connect(filter);
        filter.connect(analyser);

        var detectFreq = function() {
            window.requestAnimationFrame(detectFreq);

            var buf = new Float32Array(analyser.fftSize/2);
            analyser.getFloatTimeDomainData(buf);

            var freq = autoCorrelate(buf, context.sampleRate);
            //console.log(freq);
            freqData.shift();
            freqData.push(freq);

            var waveCanvas = waveform.getContext("2d");
            var barh = waveform.height / 13;
            var barw = (waveform.width * 3 / 4) / 512;

            waveCanvas.clearRect(0, 0, waveform.width, waveform.height);

            // wave
            waveCanvas.lineWidth = 3;
            var isdrawing = false;
            var lasty = 0;
            for(var i = 0; i < freqData.length; ++i) {
                var frequency = freqData[i];
                var note = getNote(frequency);
                var octave = parseInt(note / 12) - 1;
                var cents = getCents(frequency, note);

                currentStrings[note % 12] = noteStrings[note % 12] + octave;

                var x = i * barw;
                var y = (12 - (note % 12) - (cents / 100)) * barh;

                if(isdrawing && frequency == -1) {
                    waveCanvas.stroke();
                    isdrawing = false;
                }
                else if(!isdrawing && frequency != -1) {
                    waveCanvas.strokeStyle = "black";
                    waveCanvas.beginPath();
                    isdrawing = true;
                    waveCanvas.moveTo(x, y);
                }
                else if(isdrawing) {
                    if(Math.abs(lasty - y) > barh) {
                        waveCanvas.stroke();
                        waveCanvas.moveTo(x, y);
                    }
                    else {
                        waveCanvas.lineTo(x, y);
                    }
                }

                lasty = y;
            }
            if(isdrawing)
                waveCanvas.stroke();

            //
            waveCanvas.lineWidth = 1;
            waveCanvas.strokeStyle = "black";

            // note / axis
            waveCanvas.strokeStyle = "grey";
            waveCanvas.font = "30px Arial";
            waveCanvas.beginPath();

            for(var i = 1; i < 13; ++i) {
                waveCanvas.moveTo(0, i * barh);
                waveCanvas.lineTo(waveform.width, i * barh);
                waveCanvas.strokeText(currentStrings[13-i-1], 0, i * barh);
            }

            waveCanvas.stroke();

        }

        detectFreq();
    };

    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(streamReceived)
}
