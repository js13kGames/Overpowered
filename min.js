(function() {
// HTML ==============================================================
var wnd = window
, doc = document
, $ = function () { return doc.querySelector.apply(doc, arguments); }
, reqAnimFrame = wnd.requestAnimationFrame || wnd.mozRequestAnimationFrame
, notify = function(msg) {
    $('#game-message').textContent = msg;
  }

// Math ==============================================================
, pi = Math.PI
, xy = function(x, y) { return {x:x, y:y}; }
, rth = function(r, th) { return {r:r, th:th}; } // r/theta circular coords
, squared = function(x) { return Math.pow(x, 2); }
, dist = function(p1, p2) {
    return Math.sqrt(squared(p1.x - p2.x) + squared(p1.y - p2.y));
  }
, sin = Math.sin
, cos = Math.cos
, abs = Math.abs
, min = Math.min
, max = Math.max
, rnd = Math.random
, rnds = function(a, b) {
  if (typeof b === 'undefined') { b = a; a = 0; }
    return a + rnd() * (b - a);
  }
, rnd_choice = function(array) {
    return array[Math.floor(rnds(array.length))];
  }
, probability = function(n) { return rnd() < n; }
, vec_add = function(p1, p2) {
    return xy(p1.x + p2.x, p1.y + p2.y)
  }
, polar2cart = function(p) {
    return xy(
      p.r * cos(p.th),
      p.r * sin(p.th)
    )
  }
, interpolate = function(x, p1, p2) { // Linear
    if (!p1) { return xy(p2.x, p2.y); }
    if (!p2) { return xy(p1.x, p1.y); }
    if (p1.x === p2.x) { return xy(p1.x, p2.y); }

    var f = (x - p1.x) / (p2.x - p1.x);
    return xy(x, p1.y + f*(p2.y - p1.y));
  }
, roundTo = function(x, n) {
    return Math.round(x / n) * n;
  }
, floorTo = function(x, n) {
    return Math.floor(x / n) * n;
  }
, ceilTo = function(x, n) {
    return Math.ceil(x / n) * n;
  }
, bounds = function(x, bounds) {
    return max(min(x, max.apply(null, bounds)), min.apply(null, bounds));
  }

// other stuff...
, resetify = function(item) { if (item.reset) item.reset(); }
, tickity = function(item) { if (item.tick) item.tick(); }
, drawity = function(item) { if (item.draw) item.draw(); }

, null_function = function() {}

;
// All 2d points should be input as {x:xval, y:yval}

var draw = {
  // Utility method - apply params only for a particular drawing
  do: function(ctx, params, draw_function) {
    params = params || {};
    ctx.save();
    for (var p in params) { ctx[p] = params[p]; }
    ctx.beginPath();
    draw_function();
    if (params.cls) { ctx.closePath(); }
    if (params.fll) { ctx.fill(); }
    if (params.strk) { ctx.stroke(); }
    ctx.restore();
  },

  shapeStyle: function(color, extra) {
    var output = {fillStyle: color, strk: 0, fll: 1, cls: 1};
    for (var s in extra) { output[s] = extra[s]; };
    return output;
  },

  lineStyle: function(color, extra) {
    var output = {strokeStyle: color, strk: 1, fll: 0, cls: 0, lineWidth: 0.1};
    for (var s in extra) { output[s] = extra[s]; };
    return output;
  },

  // Clear
  clr: function(ctx) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  },

  // Fill
  f: function(ctx, color) {
    this.do(ctx, this.shapeStyle(color), function() {
      ctx.fillRect(x, y, ctx.canvas.width, ctx.canvas.height);
    })
  },

  // Line
  l: function(ctx, p0, p1, params) {
    params = params || this.lineStyle("#fff");
    this.do(ctx, params, function() {
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.moveTo(p1.x, p1.y);
    })
  },

  // Rectangle
  r: function(ctx, p0, p1, params) {
    params = params || this.shapeStyle("#fff");
    this.do(ctx, params, function() {
      ctx.rect(p0.x, p0.y, p1.x-p0.x, p1.y-p0.y);
    })
  },

  // Circle
  c: function(ctx, center, radius, params) {
    this.a(ctx, center, radius, 0, 2*Math.PI, params);
  },

  // Arc
  a: function(ctx, center, radius, angle1, angle2, params) {
    params = params || this.lineStyle("#fff");
    this.do(ctx, params, function() {
      ctx.arc(center.x, center.y, radius, angle1, angle2, false);
    })
  },

  // Bezier
  b: function(ctx, p0, p1, c0, c1, params) {
    params = params || this.lineStyle("#fff");
    this.do(ctx, params, function() {
      ctx.moveTo(p0.x, p0.y);
      ctx.bezierCurveTo(c0.x, c0.y, c1.x, c1.y, p1.x, p1.y);
    });
  },

  // Polygon
  // `todo convert pts to xy rather than array
  p: function(ctx, pts, params) {
    params = params || this.lineStyle("#fff");
    this.do(ctx, params, function() {
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.forEach(function(p) {
        ctx.lineTo(p.x, p.y);
      })
    })
  }
}
// All units in game units except for game_scale

// Game and camera settings
var game_scale = xy(20, 20) // pixels -> game units conversion
,   game_size = xy((wnd.innerWidth - 20)/game_scale.x, 30)
,   camera_margin = xy(4, 4)
,   units_per_meter = 2 // for realistic size conversions

// Aesthetic stuff
,   backgroundGradient = [
        // gradient color stops
        [1.0, '#111320'],
        [0.85, '#17182a'],
        [0.7, '#1f2035'],
        [0.4, '#433b4b'],
        [0.0, '#a16e4f']
    ]

// Environment
,   environment_color = '#222'
,   building_color = '#444'
,   num_building_clumps = 10
,   num_buildings_per_clump = 6
,   building_clump_width = 40

// Dynamics
// *** Gravity estimate is very sensitive to FPS measurement
,   min_dynamics_frame = 5
,   gravAccel = function() { return xy(0, gameplay_frame < min_dynamics_frame ? 0 : -9.8 / 2 / bounds(avg_fps * avg_fps, [0, 1000])); } // 9.8 m/s^2 translated to units/frame^2

// Lightning
,   lightning_chance = 0.001        // Chance that lightning will start on any given frame
,   lightning_chance_drone = 0.05   // Of each lightning strike, chance that it will hit the drone

// People
,   person_size = xy(0.3, 0.6)
,   person_color = '#000'
,   controlled_person_color = '#300'
,   person_control_rate = 0.05 // rate at which control level increases or drops
,   min_person_resistance = 2 * person_control_rate
,   person_interaction_window = 8
,   interaction_distance = 1


// Drone
,   drone_body_size = xy(0.3, 0.2)
,   drone_arm_size = xy(0.4, 0.05) // from center
,   drone_blade_size = xy(0.5, 0.1)
,   drone_color = '#000'
,   drone_signal_color = '#9eb'
,   drone_drain_rate = 0.00005 // energy per frame
,   drone_low_energy = 0.1
,   drone_high_energy = 0.9
,   drone_max_sideways_accel = 0.01

// Items
,   battery_size = {x: 0.5, y: 0.3}
,   battery_color = "#000"


// Ideas
,   idea_scale = 0.7
,   idea_color = "#ddd"

// HUD - positions are referenced from the upper right corner of game
,   hud_color = '#abb'
,   hud_color_dark = '#355'
,   hud_red = '#811'
,   hud_green = '#161'
,   hud_dial_radius = 1
,   energy_meter_position = xy(12, 28.5)
,   energy_meter_size = xy(4, 0.5)
,   rpm_meter_position = xy(3, 28.5)

;
// SETUP =============================================================
var canvas = $("#game_canvas"),
    ctx = canvas.getContext('2d'),
    origin = xy(0, 0)
;

canvas.setAttribute("width", game_size.x * game_scale.x);
canvas.setAttribute("height", game_size.y * game_scale.y);

// x/y grid, origin at lower left corner. Positive is up and rightwards
// note: it will move left/right as the player moves camera
ctx.setTransform(game_scale.x, 0, 0, -game_scale.y, 0, game_size.y * game_scale.y);
ctx.lineWidth = 0;


// CAMERA ============================================================

var Camera = {
  tick: function() {
    this.focusOnPlayerDrone();
  },

  moveBy: function(xy) {
    ctx.translate(-xy.x, -xy.y);
    origin.x += xy.x;
    origin.y += xy.y;
  },

  focusOnPlayerDrone: function() {
    var dx = Player.drone.p.x - origin.x, dy = Player.drone.p.y - origin.y;
    if (dx < camera_margin.x) { this.moveBy(xy(dx - camera_margin.x, 0)); }
    if ((game_size.x - dx) < camera_margin.x) { this.moveBy(xy(camera_margin.x - (game_size.x - dx), 0)); }

  }
}

var Platform = function(origin, xres, xrange, ypoints) {
  this.origin = origin; // this is an xy position
  this.y0 = origin.y;
  this.xres = xres;
  this.xres_offset = xrange[0] % xres;
  this.xrange = xrange;
  this.y = ypoints;

  this.yAt = function(x) {
    return this.pointAt(x).y;
  }

  this.pointAt = function(x) {
    x = bounds(x, [this.xrange[0], this.xrange[1]]);
    var x1 = floorTo(x - this.xres_offset, this.xres) + this.xres_offset;
    var x2 = ceilTo(x - this.xres_offset, this.xres) + this.xres_offset;
    return interpolate(x,
      xy(x1, this.y[x1]),
      xy(x2, this.y[x2])
    );
  };

  this.getPolygon = function(thickness) {
    var pts = [];
    pts.push(xy(this.xrange[0], this.y0 - thickness));
    for (var x = this.xrange[0]; x <= this.xrange[1]; x += this.xres) {
      pts.push(xy(x, this.y[x]));
    }
    pts.push(xy(this.xrange[1], this.y0 - thickness));
    return pts;
  };

  this.pts = this.getPolygon(6);

  this.drawRepr = function(style) {
    draw.p(ctx, this.pts, style);
  }
};

// Make a simple two-point platform
function makePlatform(origin, x_extent) {
  var y = {};
  y[origin.x] = origin.y;
  y[origin.x + x_extent] = origin.y;
  return new Platform(origin, x_extent, [origin.x, origin.x + x_extent], y);
}
// ENVIRONMENT =======================================================
var environment = {
  ground: new Platform(xy(-100, 3), 0.5, [-100, 1000], {}),

  // Height
  pts: [],
  buildings: [], // Buildings represented by [x, width, height]


  // Game loop

  reset: function() {
    // Background
    // (even though this is drawing-related, it needs to come before anything else)
    var grd = ctx.createLinearGradient(0, 0, 0, game_size.y);
    backgroundGradient.forEach(function(params) {
      grd.addColorStop.apply(grd, params);
    })
    draw.r(ctx, origin, xy(origin.x + game_size.x, origin.y + game_size.y), draw.shapeStyle(grd));

    // Draw buildings (decorative only for now)
    // (subtract 0.5 so that there's no gap betw ground and building. `temp)=
    this.buildings.forEach(function(building) {
      var x1 = building.x - building.w/2;
      var x2 = building.x + building.w/2;
      var y0 = min(environment.ground.pointAt(x1).y, environment.ground.pointAt(x2).y);
      draw.r(ctx,
        xy(x1, y0 - 0.5),
        xy(x2, y0 + building.h),
        draw.shapeStyle(building_color)
      )
    })
  },


  tick: function() {},

  draw: function() {
    // Ground
    var fill = draw.shapeStyle(environment_color);
    draw.p(ctx, this.pts, fill);
  },

  generate: function() {
    this.pts.push(xy(this.ground.xrange[0], 0));
    var terrain = this.generateTerrainFunction();
    for (var x = this.ground.xrange[0]; x < this.ground.xrange[1]; x += this.ground.xres) {

      this.ground.y[x] = this.ground.y0 + terrain(x);
      this.pts.push(xy(x, this.ground.y[x]));
    }
    this.pts.push(xy(this.ground.xrange[1],0));

    for (var i = 0; i < num_building_clumps; i++) {
      console.log('generate #' + i);
      this.generateBuildingClump();
    }
  },

  generateBuildingClump: function() {
    var x0 = rnds.apply(wnd, this.ground.xrange);
    var n = num_buildings_per_clump + rnds(-3, 3);

    for (var i = 0; i < n; i++) {
      this.buildings.push({
        x: rnds(x0 - building_clump_width/2, x0 + building_clump_width/2),
        w: rnds(4, 7),
        h: rnds(5, 20)
      })

    }
  },

  generateTerrainFunction: function() {
    var frequencies = [];
    for (var i = 0; i < 10; i++) {
      frequencies.push(1/rnds(1, 5));
    }

    // some lower-frequency rolling
    frequencies.push(1/rnds(10, 12));

    return function(x) {
      var y = 0;
      frequencies.forEach(function(f) {
        y += 1/(f * 100) * sin(f*x + rnds(0, 0.5));
      })
      return y;
    }

  }
}

// Each idea is global; person objects have refs to the same idea object
// Ideas are not included in the game loop

function Idea(name, options) {
  options = options || {};
  this.name = name;

  // This drawing method will be drawn right above the people talking about it
  // arguments: p, scale, style
  this.drawRepr = options.draw || null_function;
}

// ACTORS ============================================================
// they move around
// ** parent object

function Actor(p) {
  this.p = p || xy(0, 0);
  this.v = xy(0, 0);
  this.gravity = false;
  this.platform = environment.ground;
  this.stay_on_platform = false;

  this.tick = function() {
    this.p.x += this.v.x;
    this.p.y += this.v.y;

    if (this.gravity) {
      this.v = vec_add(this.v, gravAccel());
    }

    // Ground collision
    var y0 = this.platform.yAt(this.p.x);
    if (this.p.y < y0) {
      this.p.y = y0;

      // Don't do this every frame so that actor doesn't get stuck
      this.v.y = max(this.v.y, 0);
      // this.color = 'red';

      if (this.stay_on_platform) {
        // Set y coordinate to be the platform's y coordinate
        this.p =this.platform.pointAt(this.p.x);
      }
    }

    this.handleBehavior();
  }

  // Behavior stuff ============================

  this.behaviors = {
    idle: function() {
      // do nothing
      return;
    }
  }

  this.current_behavior = 'idle';
  this.current_behavior_timeleft = -1;
  this.current_behavior_params = {};

  this.handleBehavior = function() {
    this.current_behavior_timeleft -= 1;
    
    var start_behavior = false;
    if (this.current_behavior_timeleft < 0) {
      this.switchBehavior();
      start_behavior = true;
    }

    this.behaviors[this.current_behavior].call(this, start_behavior);
  }

  this.switchBehavior = function(new_behavior) {
    // For now, choose another behavior at random
    this.current_behavior = new_behavior || rnd_choice(Object.keys(this.behaviors));
    this.current_behavior_timeleft = rnds(50, 300);
  };

}

// PEOPLE ============================================================

function Person() {
  this.p = xy(0, 0);
  this.color = person_color;
  this.drone_distance = null; // only relevant when person is within the interaction window
  this.inventory_item = null; // each person can only hold 1 thing at a time
  this.resistance = rnd();
  this.control_level = 0;     // the person is fully controlled when this exceeds the resistance measure
  this.talking_dir = 0;
  this.stay_on_platform = true;
  this.role = roles.normal;

  this.init = function(properties) {
    for (var prop in properties) {
      this[prop] = properties[prop];
    }

    this.addIdea(wnd.ideas.smalltalk);

    return this;
  }


  this.behaviors = {
    idle: function(start) {
      // do nothing
      if (start) { this.v = xy(0, 0); }
      return;
    },

    amble: function(start) {
      if (Player.drone.person === this) { return; }
      // Set a new velocity
      if (start) { this.v = xy(rnds(-1, 1) / 20, 0); }
    },

    talk: function(start) {
      var target_person = this.current_behavior_params.person;
      if (!target_person) return;

      var d = target_person.p.x - this.p.x;

      if (abs(d) > interaction_distance) {
        // move toward target person
        this.v = xy(0.5/20, 0);
        if (d < 0) { this.v.x *= -1; }

        // delay starting the countdown until the person has been reached
        this.current_behavior_timeleft += 1;
      }
      else {
        // talk to the person
        this.v = xy(0, 0);
        this.talking_dir = abs(d)/d;
        this.talking_idea = this.latest_idea;
        target_person.addIdea(this.talking_idea);
      }
    }
  }

  this.switchBehavior = function(new_behavior) {
    if (!new_behavior) {
      // Switch between walking and idle
      new_behavior = 'idle';
      //new_behavior = this.current_behavior === 'amble' ? 'idle' : 'amble'
    }
    // For now, choose another behavior at random
    this.current_behavior = new_behavior;
    this.current_behavior_timeleft = rnds(50, 100);
  };

  this.talkTo = function(person) {
    this.current_behavior_params = {person: person};
    this.switchBehavior('talk');
  };

  this.talkToClosestPerson = function() {
    this.talkTo(this.getClosestPerson());
  }


  // `crunch `crunch `crunch - this method is basically the same as all the other 'getClosestX' functions
  // maybe put it in the Actor
  this.getClosestPerson = function() {
    // `todo `todo `todo!
    return wnd.p3;
  }

  // Roles ======================================================

  this.byRole = function(method) {
    if (!method in this.role) { console.warn('Uh oh, person role does not have method:', method); return; }
    this.role[method].apply(this);
  }


  // Game loop / drawing ========================================

  this.reset = function() {
    this.talking_dir = 0;
  }

  this.tick = function() {
    this.__proto__.tick.apply(this);
    if (abs(Player.drone.p.x - this.p.x) < person_interaction_window) {
      close_people_per_tick.push(this);
      this.drone_distance = dist(this.p, Player.drone.p);
    }

    if (this.control_level < this.resistance && this.control_level > 0) {
      // Decay the control level
      this.control_level -= person_control_rate;
      this.control_level = max(this.control_level, 0);
    }
  }

  this.draw = function() {
    var dir = this.v.x;
    this.drawRepr(this.p, 1.5, draw.shapeStyle(drone_signal_color, {globalAlpha: this.control_level * Player.drone.controlStrength(this)}), dir);
    this.drawRepr(this.p, 1, draw.shapeStyle(this.color), dir);

    if (this.talking_dir !== 0) {
      this.drawSpeechSquiggles(this.talking_dir);
      this.talking_idea.drawRepr(vec_add(this.p, xy(this.talking_dir * 0.5, 1.2)), idea_scale, draw.shapeStyle(idea_color));
    }

    this.byRole('draw');
  }

  this.drawRepr = function(p, scale, fill, dir) {
    // Dir should be negative (person facing leftwards), 0 (forwards), or positive (rightwards)
    // `CRUNCH
    dir = dir || 0;

    var scaled_size = xy(scale * person_size.x, scale * person_size.y);
    p = vec_add(p, xy(0, -(scaled_size.y - person_size.y)/2));

    // for displaying the person walking left/right
    var x1_offset_scale = (dir < 0 ? 1/3 : 1/2);
    var x2_offset_scale = (dir > 0 ? 1/3 : 1/2);

    var radius = scaled_size.x/3; // head

    var x1 = dir < 0 ? p.x : p.x - scaled_size.x/2;
    var x2 = dir > 0 ? p.x : p.x + scaled_size.x/2;


    draw.r(ctx,
      // `crunch 
      xy(p.x - scaled_size.x * x1_offset_scale, p.y),
      xy(p.x + scaled_size.x * x2_offset_scale, p.y + scaled_size.y - radius),
      fill
    );

    draw.c(ctx,
      xy(p.x, p.y + scaled_size.y - radius),
      radius,
      fill
    );

    draw.c(ctx,
      xy(p.x, p.y + scaled_size.y + radius),
      radius,
      fill
    );
  }

  this.drawSash = function(color) {
    var ps = person_size;
    draw.p(ctx, [
        vec_add(this.p, xy(-ps.x/2, 0)),
        vec_add(this.p, xy(-ps.x/2, ps.x/2)),
        vec_add(this.p, xy(ps.x/2, ps.y-ps.x/4)),
        vec_add(this.p, xy(ps.x/2, ps.y-3*ps.x/4))
      ],
      draw.shapeStyle(color)
    )
  }

  this.drawSpeechSquiggles = function(dir) {
    // `crunch
    var x = this.p.x + dir * 0.2;
    var y = this.p.y + person_size.y + 0.02;
    // draw.l(ctx, xy(x, y), xy(x+0.3, y), draw.lineStyle('#000', {lineWidth: 0.05}));
    var strk = draw.lineStyle('#000', {lineWidth: 0.05})

    draw.b(ctx,
      xy(x, y), xy( x + dir*0.3, y - 0.2),
      xy(x + dir*0.1, y), xy(x + dir*0.4, y - 0.1),
      strk
    );

    y += 0.1;

    draw.b(ctx,
      xy(x, y), xy(x + dir*0.3, y + 0.2),
      xy(x + dir*0.1, y), xy(x + dir*0.4, y + 0.1),
      strk
    );

    y -= 0.05;

    draw.l(ctx, xy(x + dir*0.2, y), xy(x + dir*0.4, y), strk)

  }

  // Items ======================================================

  this.hold = function(item) {
    this.inventory_item = item;
    item.container = this;
  }


  this.drop = function() {
    if (!this.inventory_item) return;
    this.inventory_item.p = this.platform.pointAt(this.inventory_item.p.x);
    this.inventory_item.platform = this.platform;
    this.inventory_item.container = null;
    this.inventory_item = null;
  }

  this.itemInteract = function() {
    // `todo: search for nearby items (instead of using the sample battery)
    if (this.inventory_item) {
      this.drop();
    }
    else {
      var closeItem = this.getClosestItem();
      if (closeItem && dist(this.p, closeItem.p) < interaction_distance) {
        this.hold(closeItem);
      }
    }
  }

  this.useItem = function() {
    if (!this.inventory_item) { return; }
    this.inventory_item.use();
  }

  // `crunch `crunch `crunch - this method is basically the same as drone.getClosestPerson
  this.getClosestItem = function() {
    if (close_items_per_tick.length === 0) { return null; }
    return close_items_per_tick.reduce(function(closestItem, nextItem) {
      return (nextItem.person_distance < closestItem.person_distance ? nextItem : closestItem);
    }, {person_distance:9999});
  }


  // Ideas ======================================================

  // Maps ideas => number of times the idea has come to them
  this.ideas = {};
  this.latest_idea = null; // most recent idea

  this.hasIdea = function(idea) {
    return idea.name in this.ideas;
  }

  this.addIdea = function(idea) {
    if (idea === null) { return; }

    if (!this.hasIdea(idea)) {
      this.ideas[idea.name] = 0;
    }
    this.ideas[idea.name] += 1;
    this.latest_idea = idea;
  }

}

Person.prototype = new Actor();
// An npc person's role influences various things
// and they all are displayed through some visual 
// like a hat, sash, or whatever
//
// Functions (all called with the person as `this`)
//    draw: called right after the person is drawn
//    onControl: an event triggered when the npc is controlled (by the player drone)

function Role(options) {
  this.draw = options.draw || null_function;
  this.onControl = options.onControl || null_function;
};

var roles = {
  normal: new Role({
    draw: function() {
      this.drawSash('green');
    }
  }),

  game_target: new Role({
    draw: function() {
      this.drawSash('red');
    },

    onControl: function() {
      notify('You have won. Congratulations.');
    }
  })
}
// THE DRONE =========================================================

var Drone = function(loc) {
  this.p = loc;
  this.gravity = true;
  this.energy = 1; // goes from 0 to 1
  this.powered = true;
  this.rpm_scale = 0.83;
  this.control_t0 = 0;
  this.control_signal_target = null;
  this.rpm_scale = 0.83; // starting value
  this.rpm_diff = 0; // Negative: tilted leftwards. Positive: tilted rightwards
  this.color = 'black';

  this.person = null,

  this.reset = function() {
    this.color = 'black';
  }


  this.tick = function() {
    this.rpm_scale = bounds(this.rpm_scale, [0, 1]);
    this.rpm_diff = bounds(this.rpm_diff, [-1, 1]);

    // acceleration given by copter blades
    this.v = vec_add(this.v, this.getLiftAccel());

    // introduce a good bit of sideways drag
    this.v.x *= 0.95;
    this.rpm_diff += (this.rpm_diff > 0 ? -0.003 : 0.003);

    //this will take care of gravity
    this.__proto__.tick.apply(this);

    this.energy = max(this.energy - this.getEnergyDrain(), 0);;

    if (this.energy == 0) {
      this.die();
    }
  }

  this.draw = function() { 
    // signal to person
    if (this.control_signal_target) {
      draw.l(ctx,
        this.p,
        this.control_signal_target,
        draw.lineStyle(drone_signal_color, {globalAlpha: this.controlStrength(this.control_signal_target)})
      );
      this.control_signal_target = null; // to be re-set
    }

    // The drone itself
    this.drawRepr(this.p, 1, draw.shapeStyle(this.color), this.getTilt());
  }

  this.drawRepr = function(p, scale, fill, tilt) {
    // `CRUNCH: This whole method
    tilt = tilt || 0;
    ctx.translate(p.x, p.y);
    ctx.rotate(-tilt);

    var strk = draw.lineStyle(fill.fillStyle, {lineWidth: scale * drone_arm_size.y});

    var width = scale * drone_body_size.x/2;
    var height = scale * drone_body_size.y/2;

    var arm_x = scale * drone_arm_size.x;
    var arm_y = scale * drone_arm_size.y/2;

    var blade_x = scale * drone_blade_size.x/2;
    var blade_y = scale * drone_blade_size.y/2;

    // body
    draw.r(ctx,
      // `crunch
      xy(- width, - height),
      xy(+ width, + height),
      fill
    );

    // arms
    draw.l(ctx,
      xy(- arm_x, + height + arm_y),
      xy(+ arm_x, + height + arm_y),
      strk
    )

    // copter blades above arms
    function drawBlade(xpos, xscale) {
      // `crunch
      draw.r(ctx,
        xy(xpos - xscale * blade_x, height + arm_y*2 + 0.05),
        xy(xpos + xscale * blade_x, height + arm_y*2 + 0.05 + blade_y*2),
        fill
      );
      draw.l(ctx,
        xy(xpos, height + arm_y),
        xy(xpos, height + arm_y*2 + 0.1),
        strk
      )
    }

    var f = 0.8;
    var blade_phase = (this.powered && (typeof this.rpm_scale !== 'undefined')) ? this.rpm_scale * gameplay_frame : 0.8;
    drawBlade(scale * drone_arm_size.x - 0.05, sin(f * blade_phase));
    drawBlade(-scale * drone_arm_size.x + 0.05, sin(f * blade_phase));

    ctx.rotate(tilt);
    ctx.translate(-p.x, -p.y);
  }

  this.die = function() {
      this.powered = false;
      this.rpm_scale = 0;
      notify('Your battery is drained. Refresh to play again.')
  }
  
  // Fake aerodynamics! ========================================================

  this.getLiftAccel = function() {
    // Note: this isn't physically accurate :)
    // For balancing purposes, full lift should be a little higher than gravity
    var y = this.powered ? -1.2 * gravAccel().y * this.rpm_scale : 0;
    var x = this.powered ? this.rpm_diff * drone_max_sideways_accel : 0;
    return xy(x, y);
  }

  this.getTilt = function() {
    return (this.rpm_diff + this.v.x/10) * pi/2;
  }

  // to be more responsive, these methods adjust velocity immediately as well as
  // contributing to acceleration
  this.powerUp = function() {
    this.v.y += 0.1;
    this.rpm_scale += 0.01;
  }
  
  this.powerDown = function() {
    this.v.y -= 0.1;
    this.rpm_scale -= 0.01;
  }

  this.tiltLeft = function() {
    this.v.x -= 0.1;
    this.rpm_diff -= 0.01;
  }

  this.tiltRight = function() {
    this.v.x += 0.1;
    this.rpm_diff += 0.01;
  }


  // Controlling people ========================================================

  this.controlStrength = function(person) {
    return 1;
    // On scale from 0 to 1, depending on how near drone is to person
    person = person || this.person;
    if (!person) { return 0; }
    return 0.5 + Math.atan(20 - dist(this.p, person.p))/pi;
  }

  this.uncontrol = function() {
    if (!this.person) return;
    this.person.color = person_color;

    // The newly released person's willpower has been decreased;
    // it will be easier to re-control them in the future
    this.person.control_level = 0;

    // Now the person is eager to talk about their experience
    this.person.addIdea(wnd.ideas.drone);
    this.person.talkToClosestPerson();

    this.person = null;
  }

  this.controlFull = function(person) {
    this.uncontrol(); // Only control one at a time!
    this.person = person;
    this.person.color = controlled_person_color;
    this.person.control_level = 1;
    // Once a person is fully controlled, their resistance drops very low
    this.person.resistance = min_person_resistance;

    this.person.byRole('onControl');
  }

  this.attemptControl = function() {
    // square the control strength so that it's more limited
    var person = this.getClosestPerson();
    if (person && probability(squared(this.controlStrength()))) {
      person.control_level += person_control_rate * 2; // multiplied by two to counteract the decay
      this.control_signal_target = vec_add(person.p, xy(0, person_size.y));

      // the person will notice the drone, so they'll get the idea of the drone
      person.addIdea(wnd.ideas.drone);

    }
    else {
      this.control_signal_target = null;
    }

    // If the control level on the person exceeds their resistance, the person has been overpowered
    if (person.control_level >= person.resistance) {
      this.controlFull(person);
    }
  }

  this.getClosestPerson = function() {
    if (close_people_per_tick.length === 0) { return null; }
    return close_people_per_tick.reduce(function(closestPerson, nextPerson) {
      return (nextPerson.drone_distance < closestPerson.drone_distance ? nextPerson : closestPerson);
    }, {drone_distance:9999});
  }


  // Energy related ========================================================

  this.fillEnergy = function() {
    this.energy = 1;
  }

  this.getEnergyDrain = function() {
    // per frame
    // this combines all the possible factors which contribute to energy drain;
    return drone_drain_rate * this.rpm_scale;
  }

}

Drone.prototype = new Actor();

// THE PLAYER ========================================================
// it moves stuff around

var Player = {
  drone: new Drone(xy(10, 10.05)),

  draw: function() {

  },

  inputControlMap: { // `crunch `crunch `crunch
    // map event.which => function
    // ADSW directions for drone
    65: function() { Player.drone.tiltLeft(); },
    68: function() { Player.drone.tiltRight(); },
    83: function() { Player.drone.powerDown(); },
    87: function() { Player.drone.powerUp(); },
    37: function() { if (probability(Player.drone.controlStrength())) Player.drone.person.p.x -= 1; },
    39: function() { if (probability(Player.drone.controlStrength())) Player.drone.person.p.x += 1; },
    40: function() { if (probability(Player.drone.controlStrength())) Player.drone.person.itemInteract(); },
    38: function() { Player.drone.person.useItem(); },
    32: function() {
      // Player must hold down spacebar for the requisite length of time
      Player.drone.attemptControl();
    }
  }
}

// LIGHTNING  ========================================================
// `experiment
lightning = {
  timeleft: -1,
  pts: [[]],
  tick: function() {
    if (this.timeleft >= 0) {
      this.timeleft -= 1;
    }

    if (probability(lightning_chance)) { this.strike(); }
  },
  draw: function() {
    if (this.timeleft < 0) { return; }
    var glowdata = [
      // color, linewidth, alpha
      ['#aaf', 0.5, 0.05],
      ['#aaf', 0.3, 0.05],
      ['#aaf', 0.1, 0.5],
      ['#ccf', 0.05, 1]
    ];
    var pts = this.pts;
    glowdata.forEach(function(data) {
      draw.p(ctx, pts, draw.lineStyle(data[0], {lineWidth: data[1], globalAlpha: data[2]}))
    })
  },
  redraw: function() {
    // Pick an origin point in the sky and random walk downwards
    var x = rnds(game_size.x + origin.x), y = game_size.y;
    this.pts = [xy(x, y)];
    var p = 0;
    while (y > environment.ground.yAt(x)) {
      x += rnds(-0.4, 0.4);
      y -= rnds(0.5, 1);
      this.pts.push(xy(x, y));
    }
  },
  strike: function() {
    this.redraw();
    this.timeleft = rnds(10, 50);
  }
}
// ITEMS ============================================================
// ** Parent object
// ** container must be an actor

function Item(loc) {
  this.p = loc;
  this.platform = environment.ground;
  this.container = null;
  this.person_distance = null;
}

Item.prototype.tick = function() {
  if (this.container) {
    this.p = vec_add(this.container.p, xy(0.45, 0.2));
  }
  else if (Player.drone.person) {
    // `crunch. This is basically the same as the person/drone stuff in people.js
    if (abs(Player.drone.person.p.x - this.p.x) < person_interaction_window) {
      close_items_per_tick.push(this);
      this.person_distance = dist(this.p, Player.drone.person.p);
    }      
  }

  if (!this.container) {
    // keep it on the ground
    this.p =this.platform.pointAt(this.p.x);
  }
  
}

// BATTERIES ============================================================

function Battery(loc) {
  this.item = new Item(loc);
  this.p = loc;

  // tick is performed by item object

  this.draw = function() {
    this.drawRepr(this.p, 1, draw.shapeStyle(battery_color));
  }

  this.use = function() {
    // Batteries get used by the drone
    // `todo (when energy stuff is implemented): fill drone battery level
    if (dist(this.p, Player.drone.p) > interaction_distance) { return; }
    loopDestroy(this);
    if (this.container) this.container.drop();
    Player.drone.fillEnergy();
  },

  this.drawRepr = function(p, scale, fill) {
    var radius = scale * battery_size.x / 2;
    var height = scale * battery_size.y;

    draw.r(ctx,
      // `crunch
      {x: p.x - radius, y: p.y},
      {x: p.x + radius, y: p.y + height},
      fill
    );

    // bumps to suggest battery terminals
    [-0.2, 0.05].forEach(function(x) {
      x *= scale;
      draw.r(ctx,
        // `crunch
        {x: p.x + x, y: p.y + height},
        {x: p.x + x + 0.15 * scale, y: p.y + height + 0.1 * scale},
        fill
      );  
    })
  }
}
Battery.prototype = new Item();

// Unused fancy stuff.

var Hud = {
  draw: function() {

    for (var display_name in this.displays) {
      this.displays[display_name].call(this);
    }
    if (gameplay_frame % 20 === 0) { this.fillInfo(); }
  },

  fillInfo: function() {
    $("#game-info #fps").textContent = Math.round(avg_fps * 10)/10;
  },

  displays: {
    energy: function() {
      var p = xy(game_size.x - energy_meter_position.x, energy_meter_position.y);
      (new Battery()).drawRepr(p, 2, draw.shapeStyle(hud_color));

      p = vec_add(p, xy(1, 0.1));

      draw.r(ctx,
        p,
        vec_add(p, energy_meter_size),
        draw.shapeStyle(hud_color_dark)
      );
      
      draw.r(ctx,
        p,
        vec_add(p, xy(energy_meter_size.x * Player.drone.energy, energy_meter_size.y)),
        draw.shapeStyle(hud_color)
      );

      // `todo: include a percentage next to the bar

    },

    rpm: function() {
      this.drawDial(
        hud_dial_radius,
        xy(game_size.x - rpm_meter_position.x, rpm_meter_position.y),
        Player.drone.rpm_scale,
        [0.82, 0.85]
      );

    }
  },

  // generic drawing methods

  drawDial: function(r, p0, dial_percent, green_range) {
    // Draw a dial. `crunch maybe
    var p1 = vec_add(p0, polar2cart(rth(r, 0)));
    var p2 = vec_add(p0, polar2cart(rth(r, pi)));
    var pe = vec_add(p0, polar2cart(rth(r*0.8, pi * (1- dial_percent))));
    p1.x += 0.2; // for style niceness
    p2.x -= 0.2;

    var basic_style = draw.lineStyle(hud_color);

    var green_range = green_range || [0, 0]
    var green_angle1 =  pi * (1 - green_range[0]);
    var green_angle2 =  pi * (1 - green_range[1]);

    draw.a(ctx, p0, r, 0, pi, draw.shapeStyle(hud_color_dark))
    draw.a(ctx, p0, r * 0.2, 0, pi, draw.shapeStyle(hud_color))
    draw.a(ctx, p0, r, 0, pi, draw.lineStyle(hud_color, {lineWidth: 0.2}));
    draw.a(ctx, p0, r, green_angle2, green_angle1, draw.lineStyle(hud_green, {lineWidth: 0.2}));
    p0.y += 0.05;
    pe.y += 0.05;
    draw.l(ctx, p0, pe, basic_style);
    // draw.l(ctx, p1, p2, basic_style);
  }
}


// GAME EVENTS =======================================================

// `nb: this would be less janky if input check was inside the tick function

window.addEventListener("keydown", function(event) {
  if (event.which in Player.inputControlMap) {
    event.preventDefault();
    Player.inputControlMap[event.which]();
  }
});

// GAME LOOP =========================================================

// Game state
var gameplay_on = false;
var gameplay_frame = 0;
var gameplay_t0 = 0;
var gameplay_time = 0;
var gameplay_fps = 0;
var avg_fps = 0;

var debug_period = 500; // `temp

// The drone code will only interact with these people (for slightly more efficent operation)
var close_people_per_tick = [];
var close_items_per_tick = []; // `crunch


// GAME LOOP FUNCTION
function go(time) {
  if (!gameplay_on) { return; }
  reqAnimFrame(go);

  // calculate fps
  var dt = time - gameplay_time;
  gameplay_fps = 1000 / dt;
  gameplay_time = time;
  if (gameplay_frame === 0) {
    gameplay_t0 = time;
  }
  else {
    avg_fps = (gameplay_time - gameplay_t0) / gameplay_frame;
  }

  if (gameplay_frame % debug_period === 0) {
    console.group("Frame " + gameplay_frame + " | " + time); // `temp
  }

  close_people_per_tick = [];
  close_items_per_tick = []; // `crunch

  loop_objects.forEach(resetify);
  loop_objects.forEach(tickity);
  loop_objects.forEach(drawity);

  debug("Drone controls: ", Player.drone.person);
  debug("Person holds:   ", Player.drone.person ? Player.drone.person.inventory_item : null);
  debug("Drone energy:   ", Player.drone.energy);

  debug(" "); debug(" ");
  if (gameplay_frame % debug_period === 0)  { console.groupEnd(); } // `temp
  if (gameplay_frame in gameplay_frame_callbacks) {
    gameplay_frame_callbacks[gameplay_frame]();
  }

  gameplay_frame += 1;

}

function loopDestroy(obj) {
  console.log('Destroyng:', obj);
    delete obj.tick;
    delete obj.draw;
}


// For `temporary debugging
function debug() {
  if (gameplay_frame % debug_period !== 0) { return; }
  console.debug.apply(console, arguments);
}


// This stuff is sort of `temporary as well
gameplay_frame_callbacks = {};

wnd.onFrame = function(frame, callback) {
  gameplay_frame_callbacks[frame] = callback;
}
wnd.onload = function() {

  // Global game ideas - things NPC people talk about to each other
  wnd.ideas = {
    smalltalk: new Idea('smalltalk'), // this is basically the null/default idea

    drone: new Idea('drone', {
      draw: Player.drone.drawRepr
    })
  }

  // A sample platform
  wnd.platform = makePlatform(xy(15, 6), 10);
  wnd.platform.draw = function() {
    this.drawRepr(draw.shapeStyle('#2E272E'));
  }

  // `temp sample people/items
  wnd.p1 = (new Person()).init({p: xy(19, 3), v: xy(0.05, 0), platform: wnd.platform});
  wnd.p2 = (new Person()).init({p: xy(18, 3)});
  wnd.p3 = (new Person()).init({p: xy(27, 3), v: xy(-0.05, 0)});
  

  // Game target: if you overpower this one, you win
  wnd.target = (new Person()).init({p: xy(37, 3), v: xy(-0.05, 0), role: roles.game_target});

  wnd.battery1 = new Battery(xy(23, 3));
  wnd.battery2 = new Battery(xy(28, 3));

  wnd.battery1.platform = wnd.platform;

  Player.drone.controlFull((new Person()).init({p: xy(Player.drone.p.x  + 3, environment.ground.y0)}));

  wnd.loop_objects = [
    battery1, battery2,
    Player.drone, Player.drone.person, Player,
    p1, p2, p3, target,
    wnd.platform,
    environment, lightning,
    Camera, Hud
  ];
  environment.generate();

  // wnd.onFrame(200, function() {
  //   Player.drone.uncontrol();
  // })
  
  gameplay_on = true;
  reqAnimFrame(go);
};
})();