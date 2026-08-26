{
  description = "aura-app dev environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in {
        devShells.default = pkgs.mkShell {
          # watchman powers Metro's file watching for `expo start` (apps/mobile) — without it
          # Metro falls back to Node's fs.watch, which is slower and less reliable on macOS for a
          # monorepo this size.
          packages = [ pkgs.nodejs_24 pkgs.watchman ];

          shellHook = ''
            export PATH="$PWD/node_modules/.bin:$PATH"

            # package.json's "packageManager" field is the single source of truth for the pnpm
            # version — corepack (bundled with nodejs_24) reads it and activates exactly that
            # version, so there's no second pin (e.g. nixpkgs' own pnpm build) that can drift from
            # it silently. Shims land in a repo-local, gitignored directory since the Nix store
            # path corepack normally shims into is read-only.
            mkdir -p "$PWD/.corepack"
            corepack enable --install-directory "$PWD/.corepack" pnpm
            export PATH="$PWD/.corepack:$PATH"

            echo "node $(node --version)"
            echo "pnpm $(pnpm --version)"
          '';
        };
      });
}
