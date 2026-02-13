import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Lock, UserPlus, LogIn } from 'lucide-react';

export const Login: React.FC = () => {
    const navigate = useNavigate();
    const { login, register } = useAuthStore();
    const [isRegister, setIsRegister] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !password.trim()) {
            setError('Please fill in all fields');
            return;
        }

        setLoading(true);
        setError('');
        try {
            if (isRegister) {
                await register(username.trim(), password);
            } else {
                await login(username.trim(), password);
            }
            navigate('/');
        } catch (err: any) {
            setError(err.message || 'Authentication failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-matrix-darker text-matrix-text p-4 font-sans selection:bg-matrix-green/30">
            {/* Ambient Background Elements */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-matrix-green/5 blur-[120px] rounded-full animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 blur-[120px] rounded-full animate-pulse delay-700" />
            </div>

            <div className="bg-matrix-dark p-1 rounded-[2.5rem] shadow-2xl w-full max-w-sm border border-white/5 relative z-10">
                <div className="bg-matrix-dark p-6 rounded-[2.3rem] border border-white/10">
                    <div className="flex justify-center mb-6">
                        <div className="w-12 h-12 bg-matrix-green/10 rounded-2xl border border-matrix-green/20 flex items-center justify-center">
                            <LogIn size={24} className="text-matrix-green" />
                        </div>
                    </div>

                    <div className="text-center mb-6">
                        <h2 className="text-3xl font-black text-white mb-2 tracking-tight">
                            {isRegister ? 'New Account' : 'Welcome Back'}
                        </h2>
                        <p className="text-matrix-muted text-[13px] font-medium leading-relaxed">
                            {isRegister
                                ? 'Create a secure account.'
                                : 'Sign in to your account.'}
                        </p>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl mb-8 text-sm flex items-center gap-3 animate-in slide-in-from-top-2 duration-300">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="block text-[10px] font-black text-matrix-muted uppercase mb-1 tracking-[0.2em] pl-1">
                                Username
                            </label>
                            <div className="relative group">
                                <KeyRound size={18} className="absolute left-4 top-[15px] text-matrix-muted group-focus-within:text-matrix-green transition-all duration-300" />
                                <input
                                    type="text"
                                    placeholder="Username..."
                                    className="w-full bg-matrix-darker p-4 pl-12 rounded-xl border border-white/10 focus:border-matrix-green/50 focus:bg-matrix-dark focus:outline-none transition-all text-[14px] placeholder:text-white/10 font-bold"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="block text-[10px] font-black text-matrix-muted uppercase mb-1 tracking-[0.2em] pl-1">
                                Password
                            </label>
                            <div className="relative group">
                                <Lock size={18} className="absolute left-4 top-[15px] text-matrix-muted group-focus-within:text-matrix-green transition-all duration-300" />
                                <input
                                    type="password"
                                    placeholder="Password..."
                                    className="w-full bg-matrix-darker p-4 pl-12 rounded-xl border border-white/10 focus:border-matrix-green/50 focus:bg-matrix-dark focus:outline-none transition-all text-[14px] placeholder:text-white/10 font-bold"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-matrix-green hover:bg-matrix-green hover:shadow-[0_0_30px_rgba(13,189,139,0.3)] text-matrix-darker font-black py-4 px-6 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-matrix-green/20 flex items-center justify-center gap-3 disabled:opacity-50 mt-6 group text-[15px]"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-matrix-darker/30 border-t-matrix-darker rounded-full animate-spin" />
                            ) : (
                                <>
                                    <span>{isRegister ? 'Register' : 'Sign In'}</span>
                                    {isRegister ? <UserPlus size={18} /> : <LogIn size={18} />}
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-6 pt-6 border-t border-white/5 text-center flex flex-col gap-4">
                        <button
                            onClick={() => {
                                setIsRegister(!isRegister);
                                setError('');
                            }}
                            className="text-[13px] font-black text-matrix-muted hover:text-white transition-colors flex items-center justify-center gap-2 mx-auto group"
                        >
                            <span>{isRegister ? 'Already have an account?' : "New here?"}</span>
                            <span className="text-matrix-green group-hover:underline">
                                {isRegister ? 'Login' : 'Create Account'}
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Footer Removed */}
        </div>
    );
};
