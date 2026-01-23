import { redirect } from 'next/navigation'

export default function RegisterRedirect() {
  redirect('/v1/register')
}
