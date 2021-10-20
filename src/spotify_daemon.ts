// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// Copyright 2021 The Board of Trustees of the Leland Stanford Junior University
//
// Redistribution and use in source and binary forms, with or
// without modification, are permitted provided that the following
// conditions are met:
//
// 1. Redistributions of source code must retain the above copyright
//    notice, this list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above
//    copyright notice, this list of conditions and the following
//    disclaimer in the documentation and/or other materials
//    provided with the distribution.
// 3. Neither the name of the copyright holder nor the names of its
//    contributors may be used to endorse or promote products derived
//    from this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
// "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
// LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS
// FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
// COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
// INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
// (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
// SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
// HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
// STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED
// OF THE POSSIBILITY OF SUCH DAMAGE.

import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";
import * as crypto from "crypto";

const SPOTIFYD_DIST_URL =
    "https://github.com/stanford-oval/spotifyd/releases/download/";

function safeMkdir(dir: fs.PathLike) {
    try {
        fs.mkdirSync(dir);
    } catch (e: any) {
        if (e.code !== "EEXIST") throw e;
    }
}

async function asyncSpawn(cmd: string, args: string[]) {
    const child = child_process.spawn(cmd, args, {
        stdio: ["inherit", "inherit", "inherit"],
    });
    return new Promise<void>((resolve, reject) => {
        child.on("error", reject);
        child.on("exit", (status) => {
            if (status !== 0) reject(new Error(`exited with status ${status}`));
            else resolve();
        });
    });
}

export interface SpotifyDaemonOptions {
    cacheDir: string;
    username: string;
    device_name: string;
    token?: string;
    version: string;
}

export default class SpotifyDaemon {
    public options: SpotifyDaemonOptions;
    public cacheDir: string;
    public spotifydPath: string;

    protected _killed: boolean;
    protected _child: null | child_process.ChildProcess;

    constructor(options: SpotifyDaemonOptions) {
        this.options = options;

        this.cacheDir = options.cacheDir;
        this.spotifydPath = path.join(this.cacheDir, "spotifyd", "spotifyd");
        this._killed = false;
        this._child = null;

        this._init();
    }

    set token(token: undefined | string) {
        this.options.token = token;
    }

    reload() {
        this.destroy();
        setTimeout(() => {
            this._killed = false;
            this._init();
        }, 1500);
    }

    get deviceId() {
        return crypto
            .createHash("sha1")
            .update(this.options.username)
            .digest("hex"); // same protocol spotifyd uses
    }

    _checkIfInstalled() {
        try {
            return fs.existsSync(this.spotifydPath);
        } catch (e: any) {
            if (e.code === "ENOENT") return false;
            else throw new Error(e);
        }
    }

    async _download() {
        safeMkdir(path.join(this.cacheDir, "spotifyd"));

        let arch = "";
        switch (process.arch) {
            case "x64":
                break;
            case "arm":
                arch = "-armhf";
                break;
            case "arm64":
                arch = "-arm64";
                break;
            default:
                throw new Error("spotifyd unsupported architecture");
        }

        let url =
            SPOTIFYD_DIST_URL +
            this.options.version +
            "/spotifyd-linux" +
            arch +
            "-slim.zip";
        let destTempFile = path.join(this.cacheDir, "spotifyd.zip");

        try {
            await asyncSpawn("wget", [url, "-O", destTempFile]);
        } catch (e) {
            throw new Error("failed to retrieve spotifyd binary package: " + e);
        }

        try {
            await asyncSpawn("unzip", [
                destTempFile,
                "-d",
                path.join(this.cacheDir, "spotifyd"),
            ]);
        } catch (e) {
            throw new Error("failed to unpack spotifyd package: " + e);
        }

        try {
            fs.unlinkSync(destTempFile);
        } catch (e: any) {
            throw new Error(
                "failed to remove temporary spotifyd package: " + e.message
            );
        }

        return true;
    }

    async _init() {
        if (this._child !== null || this._killed) return;

        if (!this._checkIfInstalled()) await this._download();

        let envs = Object.assign({}, process.env);
        envs["PULSE_PROP"] = "media.role=music";
        this._child = child_process.spawn(
            this.spotifydPath,
            [
                "--username",
                this.options.username,
                "--device-name",
                this.options.device_name,
                "--token",
                this.options.token,
                "--no-daemon",
                "--backend",
                process.arch.match("arm") ? "alsa" : "pulseaudio",
            ],
            { stdio: ["inherit", "inherit", "inherit"], env: envs }
        );

        this._child.on("error", (err) => {
            console.error("Failed to spawn spotifyd:", err);
            this._child = null;

            // autorespawn
            setTimeout(() => this._init(), 30000);
        });

        this._child.on("exit", (status) => {
            if (this._killed) return;

            console.error("Unexpected exit of spotifyd:", status);
            this._child = null;

            // autorespawn
            setTimeout(() => this._init(), 30000);
        });
    }

    destroy() {
        this._killed = true;
        if (this._child) {
            this._child.kill();
            this._child = null;
        }
    }
}
