import EXIF from './exif';
import decoderWorkerBlobString from './DecoderWorker';

class BarcodeReader {
  static defaultConfig = {
    multiple: true,
    // The formats that the decoder will look for.
    decodeFormats: ["Code128", "Code93", "Code39", "EAN-13", "2Of5", "Inter2Of5", "Codabar"],

    // ForceUnique just must makes sure that the callback function isn't repeatedly called
    // with the same barcode. Especially in the case of a video stream.
    forceUnique: true,

    // Set to true if information about the localization should be recieved from the worker.
    localizationFeedback: false,

    // Set to true if checking orientation of the image should be skipped.
    // Checking orientation takes a bit of time for larger images, so if
    // you are sure that the image orientation is 1 you should skip it.
    skipOrientation: false
  };

  static supportedFormats = ["Code128", "Code93", "Code39", "EAN-13", "2Of5", "Inter2Of5", "Codabar"];

  constructor({imageCallback, streamCallback, localizationCallback, stream, imageErrorCallback, orientationCallback, decodeFormats, forceUnique, localizationFeedback, skipOrientation}) {
    this.config = Object.assign({}, BarcodeReader.defaultConfig, {
      decodeFormats: decodeFormats || BarcodeReader.defaultConfig.decodeFormats,
      forceUnique: forceUnique || BarcodeReader.defaultConfig.forceUnique,
      localizationFeedback: localizationFeedback || BarcodeReader.defaultConfig.localizationFeedback,
      skipOrientation: skipOrientation || BarcodeReader.defaultConfig.skipOrientation
    });
    this.squashCanvas = document.createElement("canvas");
    this.scanCanvas = this._fixCanvas(document.createElement("canvas"));
    this.scanCanvas.width = 640;
    this.scanCanvas.height = 480;
    this.scanContext = this.scanCanvas.getContext("2d");
    this.imageCallback = imageCallback;
    this.streamCallback = streamCallback;
    this.localizationCallback = localizationCallback;
    this.stream = stream;
    this.decodeStreamActive = false;
    this.imageErrorCallback = imageErrorCallback;
    this.decoded = [];
    this.decoderWorker = new Worker( URL.createObjectURL(new Blob([decoderWorkerBlobString], {type: "application/javascript"}) ) );
    this.orientationCallback = orientationCallback;
    console.log('MY CONFIG IS', this.config);
  }

  decodeImage(image) {
    console.log('IN HERE AT LEAST');
  	var img = new Image();
    console.log('new one');
  	img.onerror = this.imageErrorCallback;

    if (image instanceof Image || image instanceof HTMLImageElement) {
      console.log('FIRST IF');
      image.exifdata = false;
      if (image.complete) {
        if (this.config.SkipOrientation) {
          this._decodeImage(image, 1, "");
        } else {
          EXIF.getData(image, function(exifImage) {
            var orientation = EXIF.getTag(exifImage, "Orientation");
            var sceneType = EXIF.getTag(exifImage, "SceneCaptureType");
            if (typeof orientation !== 'number') orientation = 1;
            this._decodeImage(exifImage, orientation, sceneType);
          });
        }
      } else {
        console.log('SECOND IF');
        img.onload = () => {
          if (this.config.skipOrientation) {
            this._decodeImage(img, 1, "");
          } else {
            EXIF.getData(this, function(exifImage) {
              var orientation = EXIF.getTag(exifImage, "Orientation");
              var sceneType = EXIF.getTag(exifImage, "SceneCaptureType");
              if (typeof orientation !== 'number') orientation = 1;
              this._decodeImage(exifImage, orientation, sceneType);
            });
          }
        };
        console.log('SET SRC', image)
        img.src = image.src;
      }
    } else {
      console.log('third else');
      img.onload = () => {
        console.log('LOADED IT', img);
        if (this.config.skipOrientation) {
          console.log('IN THE IF');
          this._decodeImage(img, 1, "");
        } else {
          console.log('in THE ELSE DO EXIF');
          EXIF.getData(img, (exifImage) => {
            console.log('GOT EXIF');
            var orientation = EXIF.getTag(exifImage, "Orientation");
            var sceneType = EXIF.getTag(exifImage, "SceneCaptureType");
            if (typeof orientation !== 'number') orientation = 1;
            this._decodeImage(exifImage, orientation, sceneType);
          });
        }
      };
      console.log('IMAGE IS', image);
      img.src = image;
    }
  }

  _fixCanvas(canvas) {
    var ctx = canvas.getContext('2d');
    var drawImage = ctx.drawImage;
    ctx.drawImage = (img, sx, sy, sw, sh, dx, dy, dw, dh) => {
      var vertSquashRatio = 1;
      if (!!img && img.nodeName === 'IMG') {
        vertSquashRatio = this._detectVerticalSquash(img);
        // sw || (sw = img.naturalWidth);
        // sh || (sh = img.naturalHeight);
      }
      if (arguments.length === 9)
        drawImage.call(ctx, img, sx, sy, sw, sh, dx, dy, dw, dh / vertSquashRatio);
      else if (typeof sw !== 'undefined')
        drawImage.call(ctx, img, sx, sy, sw, sh / vertSquashRatio);
      else
        drawImage.call(ctx, img, sx, sy);
    };
    return canvas;
  }

  _detectVerticalSquash(img) {
    var ih = img.naturalHeight;
    var canvas = this.squashCanvas;
    var alpha;
    var data;
    canvas.width = 1;
    canvas.height = ih;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    try {
      data = ctx.getImageData(0, 0, 1, ih).data;
    } catch (err) {
      console.log("Cannot check verticalSquash: CORS?");
      return 1;
    }
    var sy = 0;
    var ey = ih;
    var py = ih;
    while (py > sy) {
      alpha = data[(py - 1) * 4 + 3];
      if (alpha === 0) {
        ey = py;
      } else {
        sy = py;
      }
      py = (ey + sy) >> 1;
    }
    var ratio = (py / ih);
    return (ratio === 0) ? 1 : ratio;
  }

  _decodeImage(image, orientation, sceneCaptureType) {
    if (orientation === 8 || orientation === 6) {
      if (sceneCaptureType === "Landscape" && image.width > image.height) {
        orientation = 1;
        this.scanCanvas.width = 640;
        this.scanCanvas.height = 480;
      } else {
        this.scanCanvas.width = 480;
        this.scanCanvas.height = 640;
      }
    } else {
      this.scanCanvas.width = 640;
      this.scanCanvas.height = 480;
    }
    this.decoderWorker.onmessage = this.barcodeReaderImageCallback;
    this.scanContext.drawImage(image, 0, 0, this.scanCanvas.width, this.scanCanvas.height);
    this.orientation = orientation;
    this.decoderWorker.postMessage({
      scan: this.scanContext.getImageData(0, 0, this.scanCanvas.width, this.scanCanvas.height).data,
      scanWidth: this.scanCanvas.width,
      scanHeight: this.scanCanvas.height,
      multiple: this.config.multiple,
      decodeFormats: this.config.decodeFormats,
      cmd: "normal",
      rotation: orientation,
      postOrientation: this.postOrientation
    });
  }

  _imageCallback(e) {
    if (e.data.success === "localization") {
      if (this.config.localizationFeedback) {
        this.localizationCallback(e.data.result);
      }
      return;
    }
    if (e.data.success === "orientationData") {
      this.orientationCallback(e.data.result);
      return;
    }
    var filteredData = [];
    for (var i = 0; i < e.data.result.length; i++) {
      if (this.decoded.indexOf(e.data.result[i].Value) === -1 || this.config.forceUnique === false) {
        filteredData.push(e.data.result[i]);
        if (this.config.forceUnique) this.decoded.push(e.data.result[i].Value);
      }
    }
    this.imageCallback(filteredData);
    this.decoded = [];
  }

  _streamCallback(e) {
    if (e.data.success === "localization") {
      if (this.config.localizationFeedback) {
        this.localizationCallback(e.data.result);
      }
      return;
    }
    if (e.data.success && BarcodeReader.DecodeStreamActive) {
      var filteredData = [];
      for (var i = 0; i < e.data.result.length; i++) {
        if (this.decoded.indexOf(e.data.result[i].Value) === -1 || this.config.forceUnique === false) {
          filteredData.push(e.data.result[i]);
          if (this.config.forceUnique) this.decoded.push(e.data.result[i].Value);
        }
      }
      if (filteredData.length > 0) {
        this.streamCallback(filteredData);
      }
    }
    if (this.DecodeStreamActive) {
      this.scanContext.drawImage(this.stream, 0, 0, this.scanCanvas.width, this.scanCanvas.height);
      this.decoderWorker.postMessage({
        scan: this.scanContext.getImageData(0, 0, this.scanCanvas.width, this.scanCanvas.height).data,
        scanWidth: this.scanCanvas.width,
        scanHeight: this.scanCanvas.height,
        multiple: this.config.multiple,
        decodeFormats: this.config.decodeFormats,
        cmd: "normal",
        rotation: 1
      });

    }
    if (!this.decodeStreamActive) {
      this.decoded = [];
    }
  }

}

const bcr = new BarcodeReader({decodeFormats: ['Code128']});
console.log(bcr);
window.bcr = bcr;
module.exports = BarcodeReader;
