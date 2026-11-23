import * as THREE from 'three';
import './style.css';

const LEVELS = [
  { cups: 3, swaps: 3, duration: 1.2, simultaneousPairs: 1 },
  { cups: 3, swaps: 5, duration: 0.9, simultaneousPairs: 1 },
  { cups: 5, swaps: 7, duration: 0.7, simultaneousPairs: 1 },
  { cups: 5, swaps: 9, duration: 0.55, simultaneousPairs: 2 },
  { cups: 6, swaps: 12, duration: 0.4, simultaneousPairs: 3 },
];

const STATES = {
  START: 'START',
  REVEAL: 'REVEAL',
  SHUFFLING: 'SHUFFLING',
  GUESSING: 'GUESSING',
  RESULT: 'RESULT',
  NEXT_LEVEL: 'NEXT_LEVEL',
  RETRY: 'RETRY',
  VICTORY: 'VICTORY',
};

const sceneHost = document.querySelector('#scene');
const levelLabel = document.querySelector('#level');
const scoreLabel = document.querySelector('#score');
const message = document.querySelector('#message');
const startButton = document.querySelector('#start');
const nextButton = document.querySelector('#next');
const restartButton = document.querySelector('#restart');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#edf1f4');

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(0, 7.2, 8.8);
camera.lookAt(0, 0.25, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
sceneHost.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight('#fff7df', '#6b7780', 2.2));
const keyLight = new THREE.DirectionalLight('#ffffff', 3.1);
keyLight.position.set(-5, 9, 7);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);

const table = new THREE.Mesh(
  new THREE.BoxGeometry(9.4, 0.35, 5.2),
  new THREE.MeshStandardMaterial({ color: '#b87845', roughness: 0.78 })
);
table.position.y = -0.18;
table.receiveShadow = true;
scene.add(table);

const cups = [];
let cupPositions = [
  new THREE.Vector3(-2.35, 0.55, 0),
  new THREE.Vector3(0, 0.55, 0),
  new THREE.Vector3(2.35, 0.55, 0),
  new THREE.Vector3(-4.7, 0.55, 0),
  new THREE.Vector3(4.7, 0.55, 0),
  new THREE.Vector3(0, 0.55, 0),
];

function createCup(id) {
  const group = new THREE.Group();
  group.userData.cupId = id;

  const cupMaterial = new THREE.MeshStandardMaterial({
    color: '#315c4d',
    roughness: 0.48,
    metalness: 0.05,
  });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.58, 1.15, 32), cupMaterial);
  body.position.y = 0;
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData.cupId = id;
  group.add(body);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.07, 12, 32),
    new THREE.MeshStandardMaterial({ color: '#d7b56d', roughness: 0.4 })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.58;
  rim.castShadow = true;
  rim.userData.cupId = id;
  group.add(rim);

  group.position.copy(cupPositions[id] || new THREE.Vector3(0, 0.55, 0));
  scene.add(group);
  return { id, group, positionIndex: id };
}

for (let id = 0; id < 6; id += 1) cups.push(createCup(id));

const ball = new THREE.Mesh(
  new THREE.SphereGeometry(0.23, 24, 16),
  new THREE.MeshStandardMaterial({ color: '#d93636', roughness: 0.42 })
);
ball.position.set(0, 0.12, 0);
ball.castShadow = true;
scene.add(ball);

let state = STATES.START;
let level = 1;
let score = 0;
let ballCupId = 0;
let isAnimating = false;
let guessLocked = false;
let roundVersion = 0;

function configureLevel() {
  const config = LEVELS[level - 1];
  const spacing = config.cups <= 3 ? 2.35 : config.cups === 5 ? 1.45 : 1.45;
  cupPositions = [];

  for (let index = 0; index < config.cups; index += 1) {
    cupPositions.push(new THREE.Vector3(
      (index - (config.cups - 1) / 2) * spacing,
      0.55,
      0
    ));
  }

  for (const cup of cups) {
    const active = cup.id < config.cups;
    cup.group.visible = active;
    cup.positionIndex = active ? cup.id : -1;
    if (active) cup.group.position.copy(cupPositions[cup.id]);
  }
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function setState(nextState) {
  const allowed = {
    START: [STATES.REVEAL],
    REVEAL: [STATES.SHUFFLING],
    SHUFFLING: [STATES.GUESSING],
    GUESSING: [STATES.RESULT],
    RESULT: [STATES.NEXT_LEVEL, STATES.RETRY, STATES.VICTORY],
    NEXT_LEVEL: [STATES.REVEAL],
    RETRY: [STATES.REVEAL],
    VICTORY: [STATES.START],
  };

  if (!allowed[state]?.includes(nextState)) {
    console.warn(`Invalid state transition: ${state} -> ${nextState}`);
    return false;
  }
  state = nextState;
  return true;
}

function updateStatus() {
  levelLabel.textContent = String(level);
  scoreLabel.textContent = String(score);
}

function cupAtIndex(index) {
  return cups.find((cup) => cup.positionIndex === index);
}

function syncBallToCup() {
  const cup = cups.find((item) => item.id === ballCupId);
  ball.position.x = cup.group.position.x;
  ball.position.z = cup.group.position.z;
  ball.position.y = 0.12;
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function animate(durationSeconds, onFrame) {
  return new Promise((resolve) => {
    isAnimating = true;
    const started = performance.now();
    const duration = durationSeconds * 1000;

    function frame(now) {
      const raw = Math.min((now - started) / duration, 1);
      onFrame(easeInOut(raw), raw);
      if (raw < 1) {
        requestAnimationFrame(frame);
      } else {
        onFrame(1, 1);
        isAnimating = false;
        resolve();
      }
    }

    requestAnimationFrame(frame);
  });
}

async function moveCupVertically(cup, targetY, duration) {
  const startY = cup.group.position.y;
  await animate(duration, (t) => {
    cup.group.position.y = THREE.MathUtils.lerp(startY, targetY, t);
  });
}

async function revealBall(version) {
  guessLocked = true;
  nextButton.disabled = true;
  startButton.disabled = true;
  message.textContent = 'Watch the ball';

  const activeCupCount = LEVELS[level - 1].cups;
  ballCupId = Math.floor(Math.random() * activeCupCount);
  syncBallToCup();
  const cup = cups.find((item) => item.id === ballCupId);

  await moveCupVertically(cup, 1.65, 0.65);
  if (version !== roundVersion) return;
  await animate(0.9, () => {});
  if (version !== roundVersion) return;
  await moveCupVertically(cup, 0.55, 0.65);
  if (version !== roundVersion) return;

  await shuffleCups(version);
}

async function shuffleCups(version) {
  if (!setState(STATES.SHUFFLING)) return;
  guessLocked = true;
  message.textContent = 'Watch the cups';

  const config = LEVELS[level - 1];
  for (let swap = 0; swap < config.swaps; swap += 1) {
    await performRandomSwap(config.duration);
    if (version !== roundVersion) return;
  }

  syncBallToCup();
  if (setState(STATES.GUESSING)) {
    guessLocked = false;
    message.textContent = 'Choose the cup hiding the ball';
  }
}

async function performRandomSwap(duration) {
  const config = LEVELS[level - 1];
  const availableIndices = Array.from({ length: config.cups }, (_, index) => index);
  const pairs = [];

  for (let pairIndex = 0; pairIndex < config.simultaneousPairs; pairIndex += 1) {
    if (availableIndices.length < 2) break;

    const firstPosition = Math.floor(Math.random() * availableIndices.length);
    const firstIndex = availableIndices.splice(firstPosition, 1)[0];
    const secondPosition = Math.floor(Math.random() * availableIndices.length);
    const secondIndex = availableIndices.splice(secondPosition, 1)[0];

    pairs.push([firstIndex, secondIndex]);
  }

  const movements = pairs.map(([firstIndex, secondIndex]) => {
    const firstCup = cupAtIndex(firstIndex);
    const secondCup = cupAtIndex(secondIndex);
    return {
      firstCup,
      secondCup,
      firstIndex,
      secondIndex,
      fromFirst: firstCup.group.position.clone(),
      fromSecond: secondCup.group.position.clone(),
    };
  });

  await animate(duration, (t) => {
    const arch = Math.sin(Math.PI * t);

    movements.forEach((movement, pairIndex) => {
      const zDirection = pairIndex % 2 === 0 ? 1 : -1;
      movement.firstCup.group.position.x = THREE.MathUtils.lerp(
        movement.fromFirst.x,
        movement.fromSecond.x,
        t
      );
      movement.firstCup.group.position.z = THREE.MathUtils.lerp(
        movement.fromFirst.z,
        movement.fromSecond.z,
        t
      ) + zDirection * 0.75 * arch;
      movement.firstCup.group.position.y = THREE.MathUtils.lerp(
        movement.fromFirst.y,
        movement.fromSecond.y,
        t
      ) + 1.45 * arch;

      movement.secondCup.group.position.x = THREE.MathUtils.lerp(
        movement.fromSecond.x,
        movement.fromFirst.x,
        t
      );
      movement.secondCup.group.position.z = THREE.MathUtils.lerp(
        movement.fromSecond.z,
        movement.fromFirst.z,
        t
      ) - zDirection * 0.75 * arch;
      movement.secondCup.group.position.y = THREE.MathUtils.lerp(
        movement.fromSecond.y,
        movement.fromFirst.y,
        t
      ) + 1.45 * arch;
    });

    syncBallToCup();
  });

  movements.forEach((movement) => {
    movement.firstCup.group.position.copy(cupPositions[movement.secondIndex]);
    movement.secondCup.group.position.copy(cupPositions[movement.firstIndex]);
    movement.firstCup.positionIndex = movement.secondIndex;
    movement.secondCup.positionIndex = movement.firstIndex;
  });
  syncBallToCup();
}

async function handleGuess(cupId) {
  if (state !== STATES.GUESSING || guessLocked) return;
  const version = roundVersion;
  guessLocked = true;
  setState(STATES.RESULT);

  const actualCup = cups.find((cup) => cup.id === ballCupId);
  await moveCupVertically(actualCup, 1.55, 0.55);
  if (version !== roundVersion) return;

  if (cupId === ballCupId) {
    score += 100;
    updateStatus();

    if (level === 5) {
      setState(STATES.VICTORY);
      message.textContent = `Victory! Final score: ${score}`;
      nextButton.disabled = true;
      nextButton.textContent = 'Next Level';
      startButton.disabled = true;
    } else {
      setState(STATES.NEXT_LEVEL);
      message.textContent = `Correct! +100 points`;
      nextButton.textContent = 'Next Level';
      nextButton.disabled = false;
    }
  } else {
    setState(STATES.RETRY);
    message.textContent = `Not quite. Retry Level ${level}`;
    nextButton.textContent = 'Retry Level';
    nextButton.disabled = false;
  }
}

function startRound() {
  if (state !== STATES.START && state !== STATES.NEXT_LEVEL && state !== STATES.RETRY) return;
  if (!setState(STATES.REVEAL)) return;

  configureLevel();
  roundVersion += 1;
  revealBall(roundVersion);
}

startButton.addEventListener('click', () => {
  if (state !== STATES.START) return;
  startRound();
});

nextButton.addEventListener('click', () => {
  if (state === STATES.NEXT_LEVEL) {
    level += 1;
    updateStatus();
    nextButton.disabled = true;
    state = STATES.START;
    startRound();
  } else if (state === STATES.RETRY) {
    nextButton.disabled = true;
    state = STATES.START;
    startRound();
  }
});

restartButton.addEventListener('click', () => {
  level = 1;
  score = 0;
  ballCupId = 0;
  guessLocked = false;
  isAnimating = false;
  roundVersion += 1;
  state = STATES.START;
  updateStatus();

  configureLevel();
  syncBallToCup();

  startButton.disabled = false;
  nextButton.disabled = true;
  nextButton.textContent = 'Next Level';
  message.textContent = 'Press Start to begin';
});

renderer.domElement.addEventListener('pointerup', (event) => {
  if (state !== STATES.GUESSING || guessLocked) return;

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const objects = cups
    .filter((cup) => cup.group.visible)
    .map((cup) => cup.group.children)
    .flat();
  const hit = raycaster.intersectObjects(objects, false)[0];
  if (hit) handleGuess(hit.object.userData.cupId);
});

function resize() {
  const width = sceneHost.clientWidth;
  const height = sceneHost.clientHeight;
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize);

function render() {
  if (state === STATES.SHUFFLING) syncBallToCup();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

configureLevel();
syncBallToCup();
updateStatus();
resize();
render();
