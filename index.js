const crypto = require("crypto-js");
const sharp = require("sharp");
const sdkManager = require("@devtools-ai/js-sdk");
const open = require("open");
const uuid_package = require('uuid');
const uuidv4 = uuid_package.v4;

var tagsToPrioritize = [];

function getScreenshotHash(b64Screenshot) {
  const hashDigest = crypto.MD5(b64Screenshot).toString();
  return hashDigest;
}

function iouBoxes(box1, box2) {
  return iou(box1, box2);
}

async function getElementBox(element) {
  const element_location = await element.getLocation();
  const element_size = await element.getSize();
  const element_box = {
    x: element_location.x,
    y: element_location.y,
    width: element_size.width,
    height: element_size.height,
  };
  return element_box;
}

async function matchBoundingBoxToWDIOElement(boundingBox) {
  function make_unique(some_array) {
    var a = some_array.concat();
    for (var i = 0; i < a.length; ++i) {
      for (var j = i + 1; j < a.length; ++j) {
        if (a[i] === a[j]) a.splice(j--, 1);
      }
    }
    return a;
  }

  var tagFilters = make_unique(
    tagsToPrioritize.concat(["img", "input", "button", "a"])
  );
  var best_score = 0;
  var best_elem = null;

  for (const tagFilter of tagFilters) {
    var res = await matchBoundingBoxToWDIOElementCore(boundingBox, tagFilter);
    var score = res[0];
    var element = res[1];

    if (score > best_score && element != null) {
      best_score = score;
      best_elem = element;
    }
  }
  if (best_score >= 0.5) {
    return best_elem;
  } else {
    var res = await matchBoundingBoxToWDIOElementCore(boundingBox, "*");
    var score = res[0];
    var element = res[1];

    if (score > 0.5) {
      return element;
    }
  }
}

async function matchBoundingBoxToWDIOElementCore(boundingBox, tagFilter) {
  var elements = await $$("//" + tagFilter);
  var new_box = {
    x: boundingBox["x"] / multiplier,
    y: boundingBox["y"] / multiplier,
    width: boundingBox["width"] / multiplier,
    height: boundingBox["height"] / multiplier,
  };

  var iou_scores = [];
  var element_boxes = [];
  var element_tag_names = [];
  for (const element of elements) {
    var element_box = getElementBox(element);
    var tag_name = element.getTagName();
    element_tag_names.push(tag_name);
    element_boxes.push(element_box);
  }

  element_boxes = await Promise.all(element_boxes);
  for (const box of element_boxes) {
    var score = iouBoxes(new_box, box);
    iou_scores.push(score);
  }

  let composite = [
    ...zip(iou_scores, element_boxes, element_tag_names, elements),
  ]
    .sort()
    .reverse();
  composite = composite.filter((x) => x[0] > 0);
  composite = [...composite.filter((x) => centerHit(new_box, x[1]))];
  if (composite.length == 0) {
    return [0, null];
  }

  const maxScore = composite[0][0];
  for (const [score, box, promise_tag_name, element] of composite) {
    if (score >= maxScore * 0.5) {
      tag_name = await promise_tag_name;
      if (tagFilter == "*" && (tag_name === "input" || tag_name === "button")) {
        return [score, element];
      }
    }
  }
  var score = composite[0][0];
  var element = composite[0][3];
  return [score, element];
}

function iou(elementBox, targetBox) {
  return (
    areaOverlap(elementBox, targetBox) /
    (area(elementBox.width, elementBox.height) +
      area(targetBox.width, targetBox.height) -
      areaOverlap(elementBox, targetBox))
  );
}

function areaOverlap(elementBox, targetBox) {
  const { x: x1, y: y1, width: w1, height: h1 } = elementBox;
  const { x: x2, y: y2, width: w2, height: h2 } = targetBox;
  const dx = Math.min(x1 + w1, x2 + w2) - Math.max(x1, x2);
  const dy = Math.min(y1 + h1, y2 + h2) - Math.max(y1, y2);
  if (dx >= 0 && dy >= 0) {
    return dx * dy;
  }
  return 0;
}

function area(x, y) {
  return x * y;
}

function centerHit(box1, box2) {
  const { x: x1, y: y1, width: w1, height: h1 } = box1;

  const box1Center = {
    x: x1 + w1 / 2,
    y: y1 + h1 / 2,
  };
  if (
    box1Center.x > box2.x &&
    box1Center.x < box2.x + box2.width &&
    box1Center.y > box2.y &&
    box1Center.y < box2.y + box2.height
  ) {
    return true;
  }
  return false;
}

function* zip(...toZip) {
  const iterators = toZip.map((i) => i[Symbol.iterator]());
  while (true) {
    const results = iterators.map((i) => i.next());
    if (results.some(({ done }) => done)) {
      break;
    }
    yield results.map(({ value }) => value);
  }
}

var manager = null;
var interactive_mode = false;
var multiplier = 0;

async function register(tc_name, api_key = null, priority_tags = []) {
  console.log("Registering SmartDriver plugin");
  require("dotenv").config();
  tagsToPrioritize = priority_tags;
  const testCaseName = tc_name;
  if (
    [true, "true", "TRUE", 1, "1", "yes", "YES"].includes(
      process.env.DEVTOOLSAI_INTERACTIVE
    )
  ) {
    interactive_mode = true;
  } else {
    interactive_mode = false;
  }
  if (api_key == null) {
    api_key = process.env.DEVTOOLSAI_API_KEY;
  }

  var prodUrl = 'https://smartdriver.dev-tools.ai'
  if (process.env.DEVTOOLSAI_URL != null) {
    prodUrl = process.env.DEVTOOLSAI_URL;
  }

  console.log("SmartDriver interactive mode: " + interactive_mode);

  const first_screenshot = (await browser.saveScreenshot("a.png")).toString(
    "base64"
  );
  const windowSize = await browser.getWindowSize();
  const im = await sharp("a.png");
  const metadata = await im.metadata();
  multiplier = metadata.width / windowSize.width;
  manager = sdkManager.createSDK({
    apiKey: api_key,
    baseUrl: prodUrl,
    screenMultiplier: multiplier,
  });
  await manager.createCheckIn(testCaseName);

  await browser.addCommand("findByAI$", async function (selector) {
    const element_name = selector;
    var screenshot = (await browser.saveScreenshot("a.png")).toString("base64");
    var screenshot_uuid = getScreenshotHash(screenshot);
    var resp_data = await manager.getIfScreenshotExists(
      screenshot_uuid,
      element_name
    );

    if (interactive_mode) {
      const event_id = uuidv4();
      await manager.uploadTestElementScreenshot(
        screenshot,
        element_name,
        testCaseName
      );
      var tc_res = await manager.getTestCaseBox(
        element_name,
        screenshot_uuid,
        testCaseName,
        undefined,
        event_id
      );
      if (tc_res.success && tc_res.predicted_element != null) {
        var element_box = tc_res["predicted_element"];
        var real_elem = await matchBoundingBoxToWDIOElement(element_box);
        return real_elem;
      } else {
        const url = tc_res.tc_url;
        await open(url);
        while (true) {
          tc_res = await manager.getTestCaseBox(
            element_name,
            screenshot_uuid,
            testCaseName,
            undefined,
            event_id
          );
          if (tc_res.success && tc_res.predicted_element != null) {
            var element_box = tc_res["predicted_element"];
            var real_elem = await matchBoundingBoxToWDIOElement(element_box);
            return real_elem;
          }
          if (tc_res.needs_reload) {
            var screenshot = (await browser.saveScreenshot("a.png")).toString("base64");
            var screenshot_uuid = getScreenshotHash(screenshot);
            await manager.uploadTestElementScreenshot(
              screenshot,
              element_name,
              testCaseName
            );
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    } else {
      if (
        resp_data["success"] &&
        "predicted_element" in resp_data &&
        resp_data["predicted_element"] != null
      ) {
        var element_box = resp_data["predicted_element"];
        var real_elem = await matchBoundingBoxToWDIOElement(element_box);
        return real_elem;
      } else {
        const classify_res = await manager.classifyObject(
          screenshot,
          "",
          element_name,
          testCaseName
        );
        if (!classify_res.success) {
          console.log(classify_res.message);
          throw classify_res.message;
        } else {
          var element_box = classify_res["predicted_element"];
          var real_elem = await matchBoundingBoxToWDIOElement(element_box);
          return real_elem;
        }
      }
    }
  });

  await browser.overwriteCommand("$", async function (origFn, selector, element_name=null) {
    const res = await origFn(selector);
    if (element_name == null) {
      element_name = "wdio_by_selector_" + selector;
    }
    var screenshot = (await browser.saveScreenshot("a.png")).toString("base64");
    var screenshot_uuid = getScreenshotHash(screenshot);
    try {
      var resp_data = await manager.getIfScreenshotExists(
        screenshot_uuid,
        element_name
      );

      if (!(await res.isExisting())) {
        console.log(
          "SmartDriver: element not found by selector, using screenshot"
        );
        if (interactive_mode) {
          await manager.uploadTestElementScreenshot(
            screenshot,
            element_name,
            testCaseName
          );
          var tc_res = await manager.getTestCaseBox(
            element_name,
            screenshot_uuid,
            testCaseName
          );
          if (tc_res.success && tc_res.predicted_element != null) {
            var element_box = tc_res["predicted_element"];
            var real_elem = await matchBoundingBoxToWDIOElement(element_box);
            return real_elem;
          } else {
            const url = tc_res.tc_url;
            await open(url);
            while (true) {
              tc_res = await manager.getTestCaseBox(
                element_name,
                screenshot_uuid,
                testCaseName
              );
              if (tc_res.success && tc_res.predicted_element != null) {
                var element_box = tc_res["predicted_element"];
                var real_elem = await matchBoundingBoxToWDIOElement(
                  element_box
                );
                return real_elem;
              }
              await new Promise((r) => setTimeout(r, 2000));
            }
          }
        } else {
          if (
            resp_data["success"] &&
            "predicted_element" in resp_data &&
            resp_data["predicted_element"] != null
          ) {
            var element_box = resp_data["predicted_element"];
            var real_elem = await matchBoundingBoxToWDIOElement(element_box);
            return real_elem;
          } else {
            const classify_res = await manager.classifyObject(
              screenshot,
              "",
              element_name,
              testCaseName
            );
            if (!classify_res.success) {
              console.log(classify_res.message);
              throw classify_res.message;
            } else {
              var element_box = classify_res["predicted_element"];
              var real_elem = await matchBoundingBoxToWDIOElement(element_box);
              return real_elem;
            }
          }
        }
      } else {
        var element_box = await getElementBox(res);
        if (!resp_data.exists_screenshot && !resp_data.is_frozen) {
          const upload_res = await manager.uploadTestElementScreenshot(
            screenshot,
            element_name,
            testCaseName
          );
        }
        await manager.updateTestElement(
          element_box,
          screenshot_uuid,
          element_name,
          testCaseName
        );
        return res;
      }
    } catch {
      return res;
    }
  });
}

module.exports = {
  register: register,
};
