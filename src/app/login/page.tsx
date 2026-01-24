import { redirect } from 'next/navigation'

export default function LoginRedirect() {
  redirect('/v1/login')
}
