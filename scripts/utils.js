const simplifyRegex = new RegExp(/[^A-Za-z0-9/]/g);

// Types of searches
export const SEARCH_TYPE = {
  PORTRAIT: 'portrait',
  TOKEN: 'token',
  BOTH: 'both',
};

export const PRESSED_KEYS = {
  popupOverride: false,
  config: false,
};

/**
 * Implementation of 'https://en.wikipedia.org/wiki/Levenshtein_distance'
 * Credit to: David and overlord1234 @ stackoverflow
 * Measures string similarity as a value between 0.0-1.0
 * @param {string} s1
 * @param {string} s2
 * @returns 0.0-1.0
 */
export function stringSimilarity(s1, s2) {
  const editDistance = (s1, s2) => {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();

    var costs = new Array();
    for (var i = 0; i <= s1.length; i++) {
      var lastValue = i;
      for (var j = 0; j <= s2.length; j++) {
        if (i == 0) costs[j] = j;
        else {
          if (j > 0) {
            var newValue = costs[j - 1];
            if (s1.charAt(i - 1) != s2.charAt(j - 1))
              newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
            costs[j - 1] = lastValue;
            lastValue = newValue;
          }
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  };

  var longer = s1;
  var shorter = s2;
  if (s1.length < s2.length) {
    longer = s2;
    shorter = s1;
  }
  var longerLength = longer.length;
  if (longerLength == 0) {
    return 1.0;
  }
  return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
}

/**
 * Assign new artwork to the actor
 */
export async function updateActorImage(actor, imgSrc) {
  await (actor.document ?? actor).update({
    img: imgSrc,
  });
}

/**
 * Checks if a key is pressed taking into account current game version.
 * @param {string} key v/Ctrl/Shift/Alt
 * @returns
 */
export function keyPressed(key) {
  if (isNewerVersion(game.version ?? game.data.version, '0.8.9')) {
    if (key === 'v') return game.keyboard.downKeys.has('KeyV');
    return PRESSED_KEYS[key];
  }

  if (key === 'popupOverride') key = game.settings.get('token-variants', 'actorDirectoryKey');
  else if (key === 'v') key = 'v';
  else if (key === 'config') key = 'Shift';
  return keyboard.isDown(key);
}

export function registerKeybinds() {
  if (!game.keybindings) return;
  game.keybindings.register('token-variants', 'popupOverride', {
    name: 'Popup Override',
    hint: 'When held will trigger popups even when they are disabled.',
    editable: [
      {
        key: 'ShiftLeft',
      },
    ],
    onDown: () => {
      PRESSED_KEYS.popupOverride = true;
    },
    onUp: () => {
      PRESSED_KEYS.popupOverride = false;
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });
  game.keybindings.register('token-variants', 'config', {
    name: 'Config',
    hint: 'When held during a mouse Left-Click of an Image or an Active Affect will display a configuration window.',
    editable: [
      {
        key: 'ShiftLeft',
      },
    ],
    onDown: () => {
      PRESSED_KEYS.config = true;
    },
    onUp: () => {
      PRESSED_KEYS.config = false;
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });
}

/**
 * Retrieves a custom token configuration if one exists for the given image
 */
export function getTokenConfig(imgSrc, imgName) {
  const tokenConfigs = (game.settings.get('token-variants', 'tokenConfigs') || []).flat();
  return tokenConfigs.find((config) => config.tvImgSrc == imgSrc && config.tvImgName == imgName);
}

/**
 * Retrieves a custom token configuration if one exists for the given image and removes control keys
 * returning a clean config that can be used in token update.
 */
export function getTokenConfigForUpdate(imgSrc, imgName) {
  const tokenConfig = getTokenConfig(imgSrc, imgName);
  if (tokenConfig) {
    delete tokenConfig.tvImgSrc;
    delete tokenConfig.tvImgName;
    for (var key in tokenConfig) {
      if (key.startsWith('tvTab_')) {
        delete tokenConfig[key];
      }
    }
  }
  return tokenConfig;
}

/**
 * Adds or removes a custom token configuration
 */
export function setTokenConfig(imgSrc, imgName, tokenConfig) {
  const tokenConfigs = (game.settings.get('token-variants', 'tokenConfigs') || []).flat();
  const tcIndex = tokenConfigs.findIndex(
    (config) => config.tvImgSrc == imgSrc && config.tvImgName == imgName
  );

  let deleteConfig = !tokenConfig || Object.keys(tokenConfig).length === 0;
  if (!deleteConfig) {
    tokenConfig['tvImgSrc'] = imgSrc;
    tokenConfig['tvImgName'] = imgName;
  }

  if (tcIndex != -1 && !deleteConfig) {
    tokenConfigs[tcIndex] = tokenConfig;
  } else if (tcIndex != -1 && deleteConfig) {
    tokenConfigs.splice(tcIndex, 1);
  } else if (!deleteConfig) {
    tokenConfigs.push(tokenConfig);
  }
  game.settings.set('token-variants', 'tokenConfigs', tokenConfigs);
  return !deleteConfig;
}

/**
 * Extracts the file name from the given path.
 */
export function getFileName(path) {
  return decodeURI(path).split('\\').pop().split('/').pop().split('.')[0];
}

/**
 * Extracts the file name including the extension from the given path.
 */
export function getFileNameWithExt(path) {
  return decodeURI(path).split('\\').pop().split('/').pop();
}

/**
 * Simplifies token and monster names.
 */
export function simplifyTokenName(tokenName) {
  return tokenName.replace(simplifyRegex, '').toLowerCase();
}

export function simplifyPath(path) {
  return path.replace(simplifyRegex, '').toLowerCase();
}

async function _parseForgeAssetPaths() {
  const forgePaths = game.settings.get('token-variants', 'forgeSearchPaths') || {};
  const userId = typeof ForgeAPI !== 'undefined' ? await ForgeAPI.getUserId() : '';
  const searchPaths = [];

  for (let uid in forgePaths) {
    if (uid === userId) {
      forgePaths[uid].paths.forEach((path) => {
        searchPaths.push(path);
      });
    } else if (forgePaths[uid].apiKey) {
      forgePaths[uid].paths.forEach((path) => {
        if (path.share) {
          path.apiKey = forgePaths[uid].apiKey;
          searchPaths.push(path);
        }
      });
    }
  }

  return searchPaths;
}

/**
 * Parses the searchPaths setting into a Map, distinguishing s3 buckets from local paths
 */
export async function parseSearchPaths(debug = false) {
  if (debug) console.log('STARTING: Search Path Parse');

  const regexpBucket = /s3:(.*):(.*)/;
  const regexpForge = /(.*assets\.forge\-vtt\.com\/)(\w+)\/(.*)/;
  const FORGE_ASSETS_LIBRARY_URL_PREFIX = 'https://assets.forge-vtt.com/';

  const searchPathList = (game.settings.get('token-variants', 'searchPaths') || []).flat();

  // To maintain compatibility with previous versions
  const defaultCaching = !game.settings.get('token-variants', 'disableCaching');
  if (searchPathList.length > 0 && !(searchPathList[0] instanceof Object)) {
    searchPathList.forEach((path, i) => {
      searchPathList[i] = { text: path, cache: defaultCaching };
    });
  }
  // end of compatibility code

  let searchPaths = new Map();
  searchPaths.set('data', []);
  searchPaths.set('s3', new Map());
  searchPaths.set('rolltable', []);
  searchPaths.set('imgur', []);

  let allForgePaths = [];

  for (const path of searchPathList) {
    if (path.text.startsWith('s3:')) {
      const match = path.text.match(regexpBucket);
      if (match[1]) {
        let bucket = match[1];
        let bPath = match[2];
        let buckets = searchPaths.get('s3');

        if (buckets.has(bucket)) {
          buckets.get(bucket).push({ text: bPath, cache: path.cache });
        } else {
          buckets.set(bucket, [{ text: bPath, cache: path.cache }]);
        }
      }
    } else if (path.text.startsWith('rolltable:')) {
      searchPaths.get('rolltable').push({ text: path.text.split(':')[1], cache: path.cache });
    } else if (path.text.startsWith('imgur:')) {
      searchPaths.get('imgur').push({ text: path.text.split(':')[1], cache: path.cache });
    } else if (
      path.text.startsWith('forgevtt:') ||
      path.text.startsWith(FORGE_ASSETS_LIBRARY_URL_PREFIX)
    ) {
      let url = '';
      if (path.text.startsWith(FORGE_ASSETS_LIBRARY_URL_PREFIX)) {
        url = path.text;
      } else if (typeof ForgeAPI !== 'undefined') {
        const status = ForgeAPI.lastStatus || (await ForgeAPI.status().catch(console.error)) || {};
        if (status.isAdmin) {
          url =
            FORGE_ASSETS_LIBRARY_URL_PREFIX +
            (await ForgeAPI.getUserId()) +
            '/' +
            path.text.split(':')[1];
        }
      }

      const match = url.match(regexpForge);
      if (match) {
        const userId = match[2];
        const fPath = match[3];
        if (typeof ForgeAPI !== 'undefined') {
          if (userId == (await ForgeAPI.getUserId())) {
            try {
              let files = await FilePicker.browse(
                'forgevtt',
                `${FORGE_ASSETS_LIBRARY_URL_PREFIX}${userId}/${fPath}`,
                { recursive: true }
              );
              files.dirs.push(fPath);
              allForgePaths = allForgePaths.concat(
                files.dirs.map((p) => {
                  if (!p.endsWith('/')) p += '/';
                  return {
                    text: `${FORGE_ASSETS_LIBRARY_URL_PREFIX}${userId}/${p}*`,
                    cache: path.cache,
                  };
                })
              );
            } catch (err) {
              console.log(err);
            }
          } else {
            if (!url.endsWith('/')) url += '/';
            allForgePaths.push({ text: url + '*', cache: path.cache });
          }
        }
      }
    } else {
      searchPaths.get('data').push({ text: path.text, cache: path.cache });
    }
  }

  let forgePathsSetting = (game.settings.get('token-variants', 'forgevttPaths') || []).flat();

  // To maintain compatibility with previous versions
  if (forgePathsSetting.length > 0 && !(forgePathsSetting[0] instanceof Object)) {
    forgePathsSetting.forEach((path, i) => {
      forgePathsSetting[i] = { text: path, cache: defaultCaching };
    });
  }
  // end of compatibility code

  let uniqueForgePaths = new Set();
  forgePathsSetting.forEach((path) => {
    uniqueForgePaths.add(path.text);
  });
  allForgePaths.forEach((path) => {
    if (!uniqueForgePaths.has(path.text)) {
      forgePathsSetting.push(path);
    }
  });

  searchPaths.set('forge', forgePathsSetting);
  if (game.user.can('SETTINGS_MODIFY'))
    game.settings.set('token-variants', 'forgevttPaths', forgePathsSetting);

  searchPaths.set('forgevtt', await _parseForgeAssetPaths());

  if (debug) console.log('ENDING: Search Path Parse', searchPaths);

  return searchPaths;
}

/**
 * Parses the 'excludedKeyword' setting (a comma separated string) into a Set
 */
export function parseKeywords(keywords) {
  return keywords
    .split(/\W/)
    .map((word) => simplifyTokenName(word))
    .filter((word) => word != '');
}

/**
 * Returns true of provided path points to an image
 */
export function isImage(path) {
  var extension = path.split('.');
  extension = extension[extension.length - 1];
  return ['jpg', 'jpeg', 'png', 'svg', 'webp'].includes(extension);
}

/**
 * Returns true of provided path points to a video
 */
export function isVideo(path) {
  var extension = path.split('.');
  extension = extension[extension.length - 1];
  return ['webm', 'mp4', 'm4v'].includes(extension);
}

/**
 * Send a recursive HTTP asset browse request to ForgeVTT
 * @param {string} path Asset Library path
 * @param {string} apiKey Key with read access to the Asset Library
 * @returns
 */
export async function callForgeVTT(path, apiKey) {
  return new Promise(async (resolve, reject) => {
    if (typeof ForgeVTT === 'undefined' || !ForgeVTT.usingTheForge) return resolve({});

    const url = `${ForgeVTT.FORGE_URL}/api/assets/browse`;
    const xhr = new XMLHttpRequest();
    xhr.withCredentials = true;
    xhr.open('POST', url);
    xhr.setRequestHeader('Access-Key', apiKey);
    xhr.setRequestHeader('X-XSRF-TOKEN', await ForgeAPI.getXSRFToken());
    xhr.responseType = 'json';

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) return;
      resolve(xhr.response);
    };
    xhr.onerror = (err) => {
      resolve({ code: 500, error: err.message });
    };
    let formData = {
      path: path,
      options: {
        recursive: true,
      },
    };
    formData = JSON.stringify(formData);
    xhr.setRequestHeader('Content-type', 'application/json; charset=utf-8');
    xhr.send(formData);
  });
}
