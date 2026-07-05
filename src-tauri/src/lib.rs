use std::net::{TcpListener, TcpStream};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

struct EmbeddedServer(Mutex<Option<Child>>);

fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(3001)
}

fn wait_until_ready(port: u16) {
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    for _ in 0..80 {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_ok() {
            return;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

fn spawn_server(app: &tauri::AppHandle, port: u16) -> std::io::Result<Child> {
    let resources = app.path().resource_dir().map_err(std::io::Error::other)?;
    let data_dir = app.path().app_data_dir().map_err(std::io::Error::other)?;
    std::fs::create_dir_all(&data_dir)?;

    // The Node.js runtime is bundled as a Tauri external binary, placed next
    // to the app executable at install time.
    let node = std::env::current_exe()?
        .parent()
        .expect("executable has a parent directory")
        .join(if cfg!(windows) { "node.exe" } else { "node" });

    let mut cmd = Command::new(node);
    cmd.arg(resources.join("server").join("dist").join("index.js"))
        .env("NODE_ENV", "production")
        .env("PORT", port.to_string())
        .env("DB_PATH", data_dir.join("polarchat.db"))
        .env("CLIENT_DIR", resources.join("client"))
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: never flash a console window behind the app.
        cmd.creation_flags(0x0800_0000);
    }

    cmd.spawn()
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let url: tauri::Url = if cfg!(debug_assertions) {
                // Dev: Vite serves the client, `npm run dev` runs the server.
                "http://localhost:5173".parse()?
            } else {
                let port = free_port();
                let child = spawn_server(app.handle(), port)?;
                app.manage(EmbeddedServer(Mutex::new(Some(child))));
                wait_until_ready(port);
                format!("http://localhost:{port}").parse()?
            };

            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("PolarChat")
                .inner_size(1280.0, 800.0)
                .min_inner_size(940.0, 600.0)
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build PolarChat")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(server) = app.try_state::<EmbeddedServer>() {
                    if let Ok(mut guard) = server.0.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                }
            }
        });
}
