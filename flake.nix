{
  description = "gas-clone dev environment";

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
          buildInputs = [ pkgs.nodejs_24 pkgs.pnpm ];

          shellHook = ''
            export PATH="$PWD/node_modules/.bin:$PATH"
            echo "node $(node --version)"
            echo "pnpm $(pnpm --version)"
          '';
        };
      });
}
