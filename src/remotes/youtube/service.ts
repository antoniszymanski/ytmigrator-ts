// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

import { auth as googleAuth, youtube_v3 } from "@googleapis/youtube"
import open from "open"
import typia from "typia"

type OAuth2Client = InstanceType<(typeof googleAuth)["OAuth2"]>
type Credentials = OAuth2Client["credentials"]

export async function getService(credentialsPath: string, tokenPath: string) {
  const auth = await getAuth(credentialsPath, tokenPath)
  return new youtube_v3.Youtube({ auth })
}

async function getAuth(credentialsPath: string, tokenPath: string) {
  const text = await Bun.file(credentialsPath).text()
  const options = typia.json.assertParse<{
    installed: {
      client_id: string
      client_secret: string
    }
  }>(text).installed

  const auth = new googleAuth.OAuth2(options.client_id, options.client_secret, "http://localhost:8080")
  try {
    const credentials = await Bun.file(tokenPath).json()
    typia.assertGuardEquals<Credentials>(credentials)
    auth.credentials = credentials
  } catch (e) {
    if (!typia.equals<ErrnoException>(e) || e.code !== "ENOENT") {
      throw e
    }
    await generateCredentials(auth, tokenPath)
  }
  return auth
}

async function generateCredentials(auth: OAuth2Client, tokenPath: string) {
  const code = await getCode(auth)
  const credentials = (await auth.getToken(code)).tokens
  await Bun.write(tokenPath, typia.json.stringify(credentials))
  auth.credentials = credentials
}

async function getCode(auth: OAuth2Client) {
  const authUrl = auth.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/youtube",
      "https://www.googleapis.com/auth/youtube.force-ssl",
      "https://www.googleapis.com/auth/youtubepartner",
    ],
  })
  await open(authUrl)

  // TODO: make names of received and ready more descriptive
  const received = Promise.withResolvers<string>()
  const ready = Promise.withResolvers()
  const server = Bun.serve({
    port: 8080,
    routes: {
      "/": async req => {
        const code = new URL(req.url).searchParams.get("code")
        if (!code) {
          return new Response("Error: 'code' parameter is missing from the URL", { status: 400 })
        }
        received.resolve(code)
        await ready.promise
        return new Response("Success! Now you can close this page")
      },
    },
  })
  const code = await received.promise // Wait for the server to receive the code.
  const stopped = server.stop() // Stop listening for new connections
  ready.resolve() // Continue the request
  await stopped // Wait for the server to stop
  return code
}
