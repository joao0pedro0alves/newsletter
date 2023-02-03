import { FastifyInstance } from "fastify"
import * as z from 'zod'

import NewsletterMail from "../jobs/NewsletterMail"
import { prisma } from "../lib/prisma"
import { resetTimestamp } from "../utils/resetTimestamp"

export async function messageRoutes(fastify: FastifyInstance) {
    fastify.post('/messages', async (request, reply) => {
        const createMessageBody = z.object({
            title: z.string(),
            content: z.string(),
            contacts: z.array(z.string().cuid()).min(1),
            inviteNow: z.boolean()
        })

        const { title, content, contacts: contactIds, inviteNow } = createMessageBody.parse(request.body)

        const today = resetTimestamp()

        const newMessage = await prisma.message.create({
            data: {
                createdAt: today,
                content,
                title,
                contactMessages: {
                    create: contactIds.map(contactId => ({
                        contact_id: contactId
                    }))
                }
            }
        })

        const contacts = await prisma.contact.findMany({
            where: {
                id: {
                    in: contactIds
                }
            }
        })
        
        if (inviteNow) {
            await Promise.all(
                contacts.map((contact) => {
                    NewsletterMail.handle({
                        message: newMessage,
                        contact,
                    })
                })
            )

            // Update invited_at
            await prisma.message.update({
                where: {
                    id: newMessage.id
                },
                data: {
                    invitedAt: today
                }
            })
        }

        return reply.send().status(201)
    })
}