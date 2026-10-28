
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import UseLogin from '../hooks/useLogin';
import Mascot from '../components/design/Mascot';

const schema = yup
  .object()
  .shape({
    email: yup.string().email("כתובת אימייל לא תקינה").required("חובה להזין אימייל"),
    password: yup.string().required("חובה להזין סיסמה")})
  .required();

const Login=()=>{
const login=UseLogin()
const {register,handleSubmit,formState: { errors }} = useForm({
  resolver: yupResolver(schema),
});

  return (
    
<form className="vu-login" onSubmit={handleSubmit((data) =>login.mutate(data))}>
    <input type="email" placeholder="אימייל" aria-label="אימייל" {...register('email')} />
      {errors.email && <p>{errors.email.message}</p>}
      <input type="password" placeholder="סיסמה" aria-label="סיסמה" {...register('password')} />
      {errors.password && <p>{errors.password.message}</p>}
      {login.isPending && <p>מתחבר...</p>}
    {login.isError && <p>ההתחברות נכשלה</p>}
<input type="submit" value={login.isPending ? "מתחבר..." : "התחברות"}
disabled={login.isPending}
/>
      <Mascot />
    </form>
  );
};

export default Login