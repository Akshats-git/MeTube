import mongoose, {Schema} from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const userSchema = new Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        fullName: {
            type: String,
            required: true,
            trim: true,
            index: true 
        },
        avatar: {
            type: String,  // URL to the user's avatar image
            default: null
        },
        coverImage: {
            type: String, // URL to the user's cover image
        },
        watchHistory: [
            {
                type: Schema.Types.ObjectId,
                ref: "Video"
            }
        ],
        password: {
            type: String,
            required: [true, "Password is required"],
            minlength: [6, "Password must be at least 8 characters long"]
        },
        refreshToken: {
            type: String
        }
    },
    {
        timestamps: true  // Automatically adds createdAt and updatedAt fields
    }
)

userSchema.pre("save", async function(next) {
    if(!this.modified("password")) return next();
    
    this.password = await bcrypt.hash(this.password, 10);  // runs only if password is modified or new
    
    next();
})

userSchema.methods.isPasswordCorrect = async function(password){   // instance method to compare provided password with hashed password in DB
    return await bcrypt.compare(password, this.password);
}

userSchema.methods.generateAccessToken = function() {
    // short lived acces token
    return jwt.sign({
        _id: this._id,
        email: this.email,
        username: this.username,
        fullName: this.fullName
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
        expiresIn: process.env.ACCESS_TOKEN_EXPIRY
    });
}

userSchema.methods.generateRefreshToken = function() {
    // long lived refresh token
    return jwt.sign({
        _id: this._id
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
        expiresIn: process.env.REFRESH_TOKEN_EXPIRY
    });
}

export const User = mongoose.model("User", userSchema);
