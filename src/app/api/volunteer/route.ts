import { prisma } from "@/lib/prisma"
import bcrypt from "bcrypt"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const body = await req.json()

  const passwordHash = await bcrypt.hash(body.password, 10)

  const volunteer = await prisma.volunteer.create({
    data: {
      name: body.name,
      location: body.location,
      availability: body.availability,
      description: body.description,
      email: body.email,
      passwordHash,
      skills: []
    }
  })

  return Response.json(volunteer)
}