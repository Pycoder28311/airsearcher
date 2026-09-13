import { prisma } from "@/framework/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/api/auth/authOptions"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || !session.user || !session.user.email) {
      const response = NextResponse.json({}, { status: 200 })
      // clear session cookies that can't be decrypted (e.g. made with another secret)
      const cookieHeader = req.headers.get("cookie") || ""
      for (const name of cookieHeader.match(/(__Secure-)?next-auth\.session-token(\.\d+)?(?==)/g) || []) {
        response.cookies.delete(name)
      }
      return response
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({}, { status: 200 })
    }

    // put user as child of session object
    const response = {
      user
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    )
  }
}