{
  lib,
  rustPlatform,
  fetchNpmDeps,
  npmHooks,
  cargo-tauri,
  nodejs,
  pkg-config,
  wrapGAppsHook3,
  installShellFiles,
  ffmpeg-full,
  gst_all_1,
  dbus,
  glib,
  gtk3,
  librsvg,
  webkitgtk_4_1,
  xdg-utils,
  withShellCompletions ? true,
}:

let
  mediaPackages = [
    ffmpeg-full
    gst_all_1.gstreamer
    gst_all_1.gst-plugins-base
    gst_all_1.gst-plugins-good
    gst_all_1.gst-plugins-bad
    gst_all_1.gst-plugins-ugly
    gst_all_1.gst-libav
  ];
in
rustPlatform.buildRustPackage {
  pname = "woice";
  version = (lib.importTOML ../src-tauri/Cargo.toml).package.version;
  src = ../.;

  cargoRoot = "src-tauri";
  buildAndTestSubdir = "src-tauri";
  tauriBundleType = "deb";
  cargoLock.lockFile = ../src-tauri/Cargo.lock;

  npmDeps = fetchNpmDeps {
    src = ../.;
    fetcherVersion = 2;
    hash = "sha256-3MdDCIK4Hojv2wSuVI9P1D3ycdwNM6uHilG8LS2AIDU=";
  };
  NIX_NPM_FETCHER_VERSION = "2";

  nativeBuildInputs = [
    cargo-tauri.hook
    nodejs
    npmHooks.npmConfigHook
    pkg-config
    wrapGAppsHook3
    ffmpeg-full
  ] ++ lib.optional withShellCompletions installShellFiles;
  buildInputs = [ dbus glib gtk3 librsvg webkitgtk_4_1 ] ++ mediaPackages;

  # Tests need a Wayland session and media tooling; run them with `cargo test` in the dev shell.
  doCheck = false;

  postInstall = ''
    for s in 16 32 48 64 128 256 512; do
      install -Dm644 src-tauri/icons/''${s}x''${s}.png $out/share/icons/hicolor/''${s}x''${s}/apps/woice.png
    done
    install -Dm644 src-tauri/icons/icon.svg $out/share/icons/hicolor/scalable/apps/woice.svg
    install -Dm644 share/applications/woice.desktop $out/share/applications/woice.desktop
  '' + lib.optionalString withShellCompletions ''
    installShellCompletion --cmd woice --zsh src-tauri/completions/_woice
  '';

  preFixup = ''
    gappsWrapperArgs+=(
      --set GDK_BACKEND wayland
      --prefix PATH : "${lib.makeBinPath [ ffmpeg-full glib.bin xdg-utils ]}"
      --prefix GST_PLUGIN_SYSTEM_PATH_1_0 : "${lib.makeSearchPathOutput "lib" "lib/gstreamer-1.0" mediaPackages}"
    )
  '';

  meta = {
    description = "Minimal audio trimmer for Wayland";
    license = lib.licenses.mit;
    mainProgram = "woice";
    platforms = [ "x86_64-linux" ];
  };
}
