import { useEffect, useRef, useState } from "react";

export type WorldItem = { id: string; name: string; detail: string; color?: string };
/** An on-demand renderer: no idle animation loop and no Three.js in the initial bundle. */
export function CafeWorld({
  items,
  onSelect,
}: {
  items: WorldItem[];
  onSelect: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let dispose = () => {};
    Promise.all([import("three"), import("three/addons/controls/OrbitControls.js")])
      .then(([T, { OrbitControls }]) => {
        if (cancelled || !host.current) return;
        const el = host.current;
        const renderer = new T.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        el.appendChild(renderer.domElement);
        const scene = new T.Scene();
        scene.background = new T.Color("#eee8dd");
        const camera = new T.PerspectiveCamera(45, 1, 0.1, 200);
        camera.position.set(11, 13, 16);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0, 0);
        controls.maxPolarAngle = Math.PI / 2.15;
        controls.minDistance = 6;
        controls.maxDistance = 60;
        scene.add(new T.HemisphereLight(0xffffff, 0x8c7360, 2.5));
        const light = new T.DirectionalLight(0xffffff, 3);
        light.position.set(5, 10, 8);
        scene.add(light);
        const rows = Math.max(1, Math.ceil(items.length / 4));
        const depth = Math.max(10, rows * 3 + 3);
        const clickable: InstanceType<typeof T.Mesh>[] = [];
        function box(
          w: number,
          h: number,
          d: number,
          x: number,
          y: number,
          z: number,
          color: string,
        ) {
          const mesh = new T.Mesh(
            new T.BoxGeometry(w, h, d),
            new T.MeshStandardMaterial({ color, roughness: 0.7 }),
          );
          mesh.position.set(x, y, z);
          scene.add(mesh);
          return mesh;
        }
        box(15, 0.4, depth, 0, -0.4, 0, "#c6ae8c");
        box(15, 3, 0.25, 0, 1, -depth / 2, "#284d43");
        box(0.25, 3, depth, -7.5, 1, 0, "#d9cbb6");
        items.forEach((item, i) => {
          const x = ((i % 4) - 1.5) * 3.3,
            z = Math.floor(i / 4) * 3 - (rows - 1) * 1.5;
          box(2.8, 0.9, 2, x, 0.1, z, "#79614c");
          box(3, 0.12, 2.2, x, 0.62, z, "#f8f2e7");
          const plate = new T.Mesh(
            new T.CylinderGeometry(0.7, 0.7, 0.12, 24),
            new T.MeshStandardMaterial({ color: item.color || "#c74b36" }),
          );
          plate.position.set(x, 0.82, z);
          plate.userData.id = item.id;
          scene.add(plate);
          clickable.push(plate);
          const canvas = document.createElement("canvas");
          canvas.width = 512;
          canvas.height = 192;
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "#fffaf0";
          ctx.fillRect(0, 0, 512, 192);
          ctx.fillStyle = "#253e34";
          ctx.font = "bold 28px sans-serif";
          ctx.textAlign = "center";
          const words = item.name.split(" ");
          let line = "",
            y = 48;
          for (const word of words) {
            if (ctx.measureText(line + word).width > 460) {
              ctx.fillText(line, 256, y);
              line = "";
              y += 34;
            }
            line += word + " ";
          }
          ctx.fillText(line, 256, y);
          ctx.font = "24px sans-serif";
          ctx.fillText(item.detail, 256, 164);
          const texture = new T.CanvasTexture(canvas);
          texture.colorSpace = T.SRGBColorSpace;
          const sign = new T.Mesh(
            new T.PlaneGeometry(2.8, 1.05),
            new T.MeshBasicMaterial({ map: texture, side: T.DoubleSide }),
          );
          sign.position.set(x, 1.6, z - 0.6);
          sign.userData.id = item.id;
          scene.add(sign);
          clickable.push(sign);
        });
        const render = () => renderer.render(scene, camera);
        controls.addEventListener("change", render);
        const resize = new ResizeObserver(() => {
          camera.aspect = el.clientWidth / el.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(el.clientWidth, el.clientHeight);
          render();
        });
        resize.observe(el);
        const ray = new T.Raycaster();
        const pointer = new T.Vector2();
        let down = [0, 0];
        const start = (e: PointerEvent) => {
          down = [e.clientX, e.clientY];
        };
        const click = (e: PointerEvent) => {
          if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
          const r = renderer.domElement.getBoundingClientRect();
          pointer.set(
            ((e.clientX - r.left) / r.width) * 2 - 1,
            (-(e.clientY - r.top) / r.height) * 2 + 1,
          );
          ray.setFromCamera(pointer, camera);
          const hit = ray.intersectObjects(clickable)[0];
          if (hit) select.current(hit.object.userData.id);
        };
        renderer.domElement.addEventListener("pointerdown", start);
        renderer.domElement.addEventListener("pointerup", click);
        controls.update();
        render();
        dispose = () => {
          resize.disconnect();
          controls.dispose();
          renderer.domElement.removeEventListener("pointerdown", start);
          renderer.domElement.removeEventListener("pointerup", click);
          scene.traverse((obj) => {
            if (obj instanceof T.Mesh) {
              obj.geometry.dispose();
              const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
              materials.forEach((m) => {
                if ("map" in m) (m.map as InstanceType<typeof T.Texture> | null)?.dispose();
                m.dispose();
              });
            }
          });
          renderer.dispose();
          renderer.domElement.remove();
        };
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      dispose();
    };
  }, [items]);
  return (
    <div>
      {error ? (
        <p role="status" className="rounded-xl border p-6">
          3D is unavailable on this device. Use the accessible item buttons below.
        </p>
      ) : (
        <div
          ref={host}
          role="img"
          aria-label="Interactive stylised café. Equivalent item buttons appear below."
          className="h-[460px] w-full overflow-hidden rounded-2xl border"
        />
      )}
      <p className="my-3 text-sm text-muted-foreground">
        Drag to orbit · Pinch or scroll to zoom · Tap a display to explore. Stylised layout, not a
        measured floor plan.
      </p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className="rounded-xl border bg-background p-3 text-left hover:border-primary focus-visible:ring-2"
          >
            <strong className="block">{item.name}</strong>
            <span className="text-sm text-muted-foreground">{item.detail}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
